/* eslint spaced-comment: ["error", "always", { "exceptions": ["*"] }] */

'use strict';

const express = require('express');
const compression = require('compression');
const fs = require('fs');
const bunyan = require('bunyan');
const RotatingFileStream = require('bunyan-rotating-file-stream');
const bodyParser = require('body-parser');
const WebSocketServer = require('ws').Server;
const WsStream = require('./wsStream');
const spawn = require('child_process').spawn;
const app = express();
const low = require('lowdb');
const storage = require('lowdb/lib/file-async');
const config = require('config');
const path = require('path');
const readline = require('readline');

app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.text());

const logWsStream = new WsStream('log');
const chartWsStream = new WsStream('plot');

const log = bunyan.createLogger({
  name: 'hawpey',
  area: 'main',
  streams: [
    {
      type: 'raw',
      level: config.get('logs.level'),
      stream: new RotatingFileStream({
        path: `${__dirname}/logs/device.log`,
        threshold: config.get('logs.threshold'),
        totalFiles: config.get('logs.totalFiles'),
      }),
    },
    {
      stream: process.stdout,
      level: 'error',
    },
    {
      type: 'raw',
      stream: logWsStream,
      level: 'trace',
    },
  ],
  serializers: {
    err: e => ({
      message: e.message,
      name: e.name,
      stack: e.stack,
    }),
  },
});

const charts = bunyan.createLogger({
  name: 'hawpey',
  area: 'charts',
  streams: [
    {
      type: 'raw',
      level: 'info',
      stream: new RotatingFileStream({
        path: `${__dirname}/logs/charts.log`,
        threshold: config.get('charts.threshold'),
        totalFiles: config.get('charts.totalFiles'),
      }),
    },
    {
      type: 'raw',
      stream: chartWsStream,
      level: 'info',
    },
  ],
});

const serverLog = log.child({ area: 'server' });
const programLog = log.child({ area: 'program' });

let wss = null;

exports.programLog = programLog;
exports.charts = charts;
exports.broadcastFunction = (data) => {
  wss.clients.forEach(client => client.send(JSON.stringify(data)));
};

const db = low(`${__dirname}/db.json`, { storage });
db._.mixin(require('underscore-db'));

exports.db = db;
exports.port = config.get('server.port');

function startProgram() {
  let p = null;
  try {
    p = require('./program.js').bridge;
  } catch (e) {
    log.error({ err: e }, 'Could not start program.');
    p = require('./hawpey-util.js').bridge;
  }
  return p;
}

app.use((req, res, next) => {
  next();
  const ip = req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket.remoteAddress;
  if (res.statusCode < 400) {
    serverLog.debug({ ip }, '%s %s %d', req.method, req.path, res.statusCode);
  } else {
    serverLog.debug({ ip, headers: req.headers }, '%s %s %d', req.method, req.path, res.statusCode);
  }
});

let prog = null;

app.route('/')
  .get((req, res) => {
    res.sendFile(path.resolve(`${__dirname}/../Doc/protocol/device.md`));
  });

/************************************************************
*                    Variables
************************************************************/

app.route('/variables')
  .get((req, res) => {
    res.send(prog.v.get());
  });
app.route('/variables/:name')
  .get((req, res) => {
    const v = prog.v.get(req.params.name);
    if (v) {
      res.send(v);
    } else {
      res.status(404).send({ error: 'Could not find variable' });
    }
  })
  .put((req, res) => {
    const newVal = req.body.value;
    if (!newVal) return res.status(404).send({ error: 'Value not specified' });
    let cod;
    switch (cod = prog.v.set(req.params.name, newVal)) {
      case 404:
        res.status(404).send({ error: 'Could not find variable' });
        break;
      case 400:
        res.status(400).send({ error: 'Validation failed' });
        break;
      case 204:
        res.status(204).end();
        break;
      default:
        res.status(501).send({ error: `Setting resulted in unimplemented ${cod} status code` });
    }
  });

/************************************************************
                    Controls
************************************************************/

app.route('/controls')
  .get((req, res) => {
    res.send(prog.c.get());
  });
app.route('/controls/:name')
  .get((req, res) => {
    const c = prog.c.get(req.params.name);
    if (c) {
      res.send(c);
    } else {
      res.status(404).send({ error: 'Could not find control' });
    }
  })
  .put((req, res) => {
    if (!('value' in req.body)) return res.status(400).send({ error: 'Value not specified' });
    prog.c.set(req.params.name, req.body.value).then((val) => {
      switch (val) {
        case 404:
          res.status(404).send({ error: 'Could not find control' });
          break;
        case 400:
          res.status(400).send({ error: 'Value does not match type of control' });
          break;
        case 200:
          res.status(200).send({ value: prog.c.getVal(req.params.name) });
          break;
        default:
          res.status(501).send({ error: `Setting resulted in unimplemented ${val} status code` });
      }
    });
  });

/************************************************************
                    Outputs
************************************************************/

app.route('/outputs')
  .get((req, res) => {
    res.send(prog.o.get(undefined, false));
  });
app.route('/outputs/:name')
  .get((req, res) => {
    const o = prog.o.get(req.params.name, false);
    if (o) {
      res.send(o);
    } else {
      res.status(404).send({ error: 'Could not find output' });
    }
  });

/************************************************************
                    Program
************************************************************/

app.route('/program')
  .get((req, res) => {
    res.sendFile(`${__dirname}/program.js`, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  })
  .put((req, res) => {
    const newName = `${__dirname}/revisions/program${Date.now()}.js`;
    fs.rename(`${__dirname}/program.js`, newName, err => {
      if (err) return res.status(500).send({ error: 'Error renaming file' });
      fs.writeFile(`${__dirname}/program.js`, req.body, err2 => {
        if (err2) return res.status(500).send({ error: 'Error writing to file' });
        prog.exit().then(() => {
          serverLog.info('Restarting Program');
          delete require.cache[require.resolve('./program.js')];
          delete require.cache[require.resolve('./hawpey-util.js')];
          prog = startProgram();
          res.status(204).end();
        });
      });
    });
  });

/************************************************************
                    Dependencies
************************************************************/

function npm(args) {
  return process.platform === 'win32' ?
    spawn('cmd.exe', ['/c', 'npm.cmd'].concat(args)) :
    spawn('npm', args);
}

app.route('/dependencies')
  .get((req, res) => {
    const npmp = npm(['ls', '--depth', '0']);
    const deps = {};
    const re = /extraneous: ([\w-]*)@([\w\.]*)/g;
    npmp.stderr.on('data', data => {
      let m;
      const str = data.toString();
      while ((m = re.exec(str)) !== null) {
        deps[m[1]] = m[2];
      }
    });
    npmp.on('close', code => {
      if (code === 0 || code === 1) res.status(200).send(deps);
    });
    npmp.on('error', () => {
      res.status(500).send({ error: 'Execution of npm failed' });
    });
  })
  .post((req, res) => {
    const name = req.body.name;
    if (!name) return res.status(400).send({ error: 'Name not specified' });
    const npmp = npm(['install', name + (req.body.version ? `@${req.body.version}` : '')]);
    npmp.on('close', code => {
      if (code === 0) res.status(201).end();
    });
    npmp.on('error', () => {
      res.status(500).send({ error: 'Execution of npm failed' });
    });
  });
app.delete('/dependencies/:name', (req, res) => {
  const npmp = npm(['uninstall', req.params.name]);
  let error = false;
  let ecode = 500;
  let message = 'Unexpected error in uninstall';
  npmp.stderr.on('data', data => {
    error = true;
    if (~data.toString().indexOf('not installed in')) {
      ecode = 404;
      message = 'Package not found';
    }
  });
  npmp.on('close', code => {
    if (code === 0) {
      if (error) {
        res.status(ecode).send({ error: message });
      } else {
        res.status(204).end();
      }
    }
  });
  npmp.on('error', () => {
    res.status(500).send({ error: 'Execution of npm failed' });
  });
});

/************************************************************
                    Format
************************************************************/

app.route('/format')
  .get((req, res) => {
    res.sendFile(`${__dirname}/format.json`, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  })
  .put((req, res) => {
    const newName = `${__dirname}/revisions/format${Date.now()}.json`;
    fs.rename(`${__dirname}/format.json`, newName, err => {
      if (err) return res.status(500).send({ error: 'Error renaming file' });
      fs.writeFile(`${__dirname}/format.json`, req.body, err2 => {
        if (err2) return res.status(500).send({ error: 'Error writing to file' });
        res.status(204).end();
      });
    });
  });

/************************************************************
                    Log
************************************************************/

app.get('/log', (req, res) => {
  res.sendFile(`${__dirname}/logs/device.log`);
});

/************************************************************
                    Charts
************************************************************/

app.get('/charts', (req, res) => {
  res.sendFile(`${__dirname}/logs/charts.log`);
});
app.get('/charted', (req, res) => {
  res.set('Content-Type', 'text/plain');
  const rs = fs.createReadStream(`${__dirname}/logs/charts.log`);
  const rl = readline.createInterface({
    input: rs,
  });
  const outputs = new Set();
  rl.on('line', (line) => {
    const j = JSON.parse(line);
    outputs.add(j.output);
  });
  rs.on('end', () => {
    res.send([...outputs]);
  });
});
app.get('/charts/:output', (req, res) => {
  const rs = fs.createReadStream(`${__dirname}/logs/charts.log`);
  const rl = readline.createInterface({
    input: rs,
  });
  rl.on('line', (line) => {
    const j = JSON.parse(line);
    if (j.output === req.params.output) res.write(`${line}\n`);
  });
  rs.on('end', () => {
    res.end();
  });
});

/************************************************************
                    Timers
************************************************************/

app.get('/timers', (req, res) => {
  res.send(prog.timers.get());
});
app.get('/timers/:name', (req, res) => {
  if (prog.timers.run(req.params.name)) {
    res.status(204).end();
  } else {
    res.status(404).send({ error: 'Could not find timer' });
  }
});

/************************************************************
                    Triggers
************************************************************/

app.get('/triggers', (req, res) => {
  res.status(200).send(db.get('triggers').value());
});

app.post('/triggers', (req, res) => {
  const id = db.get('triggers')
    .insert(req.body)
    .value().id;
  res.set('Location', `/triggers/${id}`);
  res.status(201).end();
});

app.route('/triggers/:id')
  .delete((req, res) => {
    db.get('triggers').removeById(req.params.id).value();
    res.status(204).end();
  })
  .get((req, res) => {
    const t = db.get('triggers').getById(req.params.id).value();
    if (t) {
      res.status(200).send();
    } else {
      res.status(404).send({ error: 'Could not find trigger' });
    }
  })
  .put((req, res) => {
    db.get('triggers').replaceById(req.params.id, req.body);
    res.status(204).end();
  });

/************************************************************
                    Server Setup
************************************************************/

const server = require(config.get('server.module')).createServer(
  ...(config.get('server.optionsSupplied') ? [{
    key: fs.readFileSync(`${__dirname}/private.key`),
    cert: fs.readFileSync(`${__dirname}/cert.crt`),
  }, app] : [app])
);

wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const j = JSON.parse(message);
      if (j.type === 'request') {
        ws.send(JSON.stringify(prog.o.get(j.filter)));
      }
    } catch (e) {
      ws.send(JSON.stringify({
        type: 'bad',
        code: 400,
        description: 'Invalid JSON',
      }));
    }
  });
});
logWsStream.setWs(wss);
chartWsStream.setWs(wss);

prog = startProgram();

try {
  server.listen(config.get('server.port'), '0.0.0.0', () => {
    log.info(`Listening on port ${config.get('server.port')}`);
  });
} catch (e) {
  log.fatal({ err: e }, 'Could not start server');
}
