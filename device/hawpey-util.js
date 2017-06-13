'use strict';

const os = require('os');
const url = require('url');
const dns = require('dns');
const http = require('http');

let vars = {};
const outputs = {};
const controls = {};

const bdF = module.parent.parent.exports.broadcastFunction;
const log = module.parent.parent.exports.programLog;
const charts = module.parent.parent.exports.charts;
const db = module.parent.parent.exports.db;
const serverPort = module.parent.parent.exports.port;
const timers = {};

function getIpAddresses() {
  const ifaces = os.networkInterfaces();
  const addresses = [];
  for (const ifname of Object.keys(ifaces)) {
    for (const iface of ifaces[ifname]) {
      addresses.push(iface.address);
    }
  }
  return addresses;
}

function addressOutput(str) {
  const doti = str.indexOf('".') + 1;
  return {
    address: JSON.parse(str.substring(0, doti)),
    name: str.substring(doti + 1),
  };
}

const logicTriggers = new Map([
  [/^\s*>\s+(.*)/, (val, test) => val > test],
  [/^\s*<\s+(.*)/, (val, test) => val < test],
  [/^\s*>=\s+(.*)/, (val, test) => val >= test],
  [/^\s*<=\s+(.*)/, (val, test) => val <= test],
  [/^\s*==\s+(.*)/, (val, test) => val == test],
  [/^\s*===\s+(.*)/, (val, test) => val === test],
]);

const dnsCache = new Map();

function checkTrigger(outputName, val) {
  const ipAddresses = getIpAddresses();

  const triggerMatches = (trigger, ip) => {
    if (ipAddresses.includes(ip)) {
      for (const [regex, func] of logicTriggers) {
        const m = trigger.conditions[0].condition.match(regex);
        if (m) {
          return func(val, JSON.parse(m[1]));
        }
      }
    }
    return false;
  };

  const triggered = (trigger) => new Promise(resolve => {
    // For now only support one condition that is a logic condition
    if (trigger.conditions.length === 1 && trigger.conditions[0].type === 'logic') {
      const { address, name } = addressOutput(trigger.conditions[0].output);
      const { hostname, port } = url.parse(`http://${address}`);

      if (port === String(serverPort) && name === outputName) {
        // Do a DNS lookup for the hostname
        if (dnsCache.has(hostname)) {
          resolve(triggerMatches(trigger, dnsCache.get(hostname)));
        } else {
          dns.lookup(hostname, (err, add) => {
            dnsCache.set(hostname, add);
            // Delete the entry from the cache after 1 hour
            setTimeout(() => dnsCache.delete(hostname), 1000 * 60 * 60);
            resolve(triggerMatches(trigger, add));
          });
        }
      } else {
        resolve(false);
      }
    } else {
      resolve(false);
    }
  });

  return Promise.all(db.get('triggers').map(triggered).value()).then(triggerResults => {
    const i = triggerResults.indexOf(true); // Try to find a trigger that matches
    if (i !== -1) {
      const trigger = db.get(`triggers[${i}]`).value();
      for (const result of trigger.results) {
        if (result.type === 'control') {
          const { address, name } = addressOutput(result.control);
          const { hostname, port } = url.parse(`http://${address}`);
          const putData = JSON.stringify({ value: result.value });
          const req = http.request({
            hostname,
            port,
            path: `/controls/${name}`,
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': putData.length,
            },
          }, res => {
            if (res.statusCode !== 200) {
              log.error({ code: res.statusCode },
                `Could not write to trigger at ${hostname}:${port}/controls/${name}`
              );
              res.setEncoding('utf8');
              res.on('data', (chunk) => {
                log.debug(`BODY: ${chunk}`);
              });
            }
          });
          req.on('error', e => {
            log.error(`Problem with request to ${hostname}:${port}/controls/${name}: ${e.message}`);
          });
          req.write(putData);
          req.end();
        }
      }
    }
  });
}

exports.bridge = {
  v: {
    get(arg) {
      if (!arg) {
        const ret = {};
        for (const name of Object.keys(vars)) {
          ret[name] = {
            value: vars[name].value,
            validator: vars[name].validator.source,
          };
        }
        return ret;
      }
      const v = vars[arg];
      if (!v) return false;
      return {
        value: v.value,
        validator: v.validator.source,
      };
    },
    set(name, value) {
      const m = vars[name];
      if (!m) return 404;
      if (!m.validator.test(value)) return 400;
      m.value = value;
      return 204;
    },
  },
  o: {
    get(filter, update = true) {
      if (!update && filter) return outputs[filter] || controls[filter];
      const retOuts = {};
      const limit = (x) => (new RegExp(filter)).test(x);
      const k = !filter ? Object.keys(outputs) : Object.keys(outputs).filter(limit);
      for (const out of k) {
        retOuts[out] = outputs[out];
      }
      const k2 = !filter ? Object.keys(controls) : Object.keys(controls).filter(limit);
      for (const c of k2) {
        retOuts[c] = { value: controls[c].value };
      }
      return update ? { type: 'update', outputs: retOuts } : retOuts;
    },
  },
  c: {
    get(name) {
      if (!name) {
        const ret = {};
        for (const c of Object.keys(controls)) {
          ret[c] = {
            type: controls[c].type,
            min: controls[c].min,
            max: controls[c].max,
          };
        }
        return ret;
      }
      const c = controls[name];
      if (!c) return false;
      return {
        type: c.type,
        min: c.min,
        max: c.max,
      };
    },
    getVal(name) {
      return controls[name].value;
    },
    set(name, value) {
      return new Promise((resolve) => {
        const m = controls[name];
        if (!m) return resolve(404);
        if (typeof value !== m.type) return resolve(400);
        const nv = m.change(value);
        if (typeof nv === 'object' && nv !== null) {
          nv.then((newVal) => {
            m.value = newVal || value;
            bdF({ type: 'update', outputs: { [name]: { value: m.value } } });
            checkTrigger(name, m.value);
            resolve(200);
          });
        } else {
          m.value = nv || value;
          bdF({ type: 'update', outputs: { [name]: { value: m.value } } });
          checkTrigger(name, m.value);
          resolve(200);
        }
      });
    },
  },
  timers: {
    run(name) {
      if (!timers[name]) return false;
      timers[name].function();
      return true;
    },
    get() {
      const newObj = {};
      Object.keys(timers).forEach((key) => {
        newObj[key] = timers[key].delay;
      });
      return newObj;
    },
  },
  exit() {
    return exports.onexit() || new Promise((resolve) => resolve());
  },
};

exports.t = (m, s) => m * 6e4 + (s || 0) * 1e3;
exports.wait = ms => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
exports.hex = n => (typeof n === 'number' ? `0x${`0${n.toString(16)}`.slice(-2)}` : n);

exports.v = (arg) => {
  if (!arg) return vars;
  if (typeof arg === 'object') {
    for (const v in arg) {
      if (!arg[v].value) throw new Error('Value must be specified');
      if (!arg[v].validator) throw new Error('Validator must be specified');
    }
    vars = arg;
  } else {
    return vars[arg];
  }
};
exports.o = (name, val) => {
  if (!name) return outputs;
  if (typeof val !== 'undefined' && val !== null) {
    if (!outputs[name]) throw new Error(`Could not find output with name '${name}'`);
    outputs[name].value = val;
    bdF({
      type: 'update',
      outputs: {
        [name]: outputs[name],
      },
    });
    checkTrigger(name, outputs[name].value);
  } else {
    if (typeof name === 'object') {
      for (const n in name) {
        if (controls[n]) throw new Error(`Output with name '${n}' already exists`);
        outputs[n] = { units: name[n], value: '...' };
      }
    } else {
      return outputs[name].value;
    }
  }
};
exports.c = (name, val) => {
  if (!name) {
    const ret = {};
    for (const c of Object.keys(controls)) {
      ret[c] = {
        value: c,
      };
    }
    return ret;
  }
  if (typeof val !== 'undefined' && val !== null) {
    if (!controls[name]) throw new Error(`Could not find control with name '${name}'`);
    controls[name].value = val;
    bdF({
      type: 'update',
      outputs: {
        [name]: {
          value: controls[name].value,
        },
      },
    });
    checkTrigger(name, controls[name].value);
  } else {
    if (typeof name === 'object') {
      for (const n of Object.keys(name)) {
        if (outputs[n]) throw new Error(`Control with name '${n}' already exists`);
        controls[n] = {
          type: name[n].type,
          value: name[n].value || (name[n].type === 'boolean' ? false : name[n].min || 0),
          change: name[n].change,
          min: name[n].min || (name[n].type === 'number' ? 0 : undefined),
          max: name[n].max || (name[n].type === 'number' ? 100 : undefined),
        };
      }
    } else {
      return controls[name].value;
    }
  }
};
exports.l = {
  trace: (...args) => log.trace(...args),
  debug: (...args) => log.debug(...args),
  info: (...args) => log.info(...args),
  warn: (...args) => log.warn(...args),
  error: (...args) => log.error(...args),
  fatal: (...args) => log.fatal(...args),
};
exports.plot = (...outputs) => {
  for (const output of outputs) {
    charts.info({ output, value: exports.bridge.o.get(output, false).value }, '');
  }
}
exports.err = (title, description, reason, resolution) => {
  bdF({
    type: 'error',
    title,
    description,
    reason,
    resolution,
  });
  log.error({
    err: { message: title, stack: description, type: 'ManualError' },
  }, 'Manually threw error');
};
exports.setTimer = (name, f, delay, ...params) => {
  timers[name] = { function: () => f(...params), delay };
  f(...params);
  return (timers[name].pid = setInterval(f, delay, ...params));
};
exports.onexit = () => new Promise((resolve) => resolve());
