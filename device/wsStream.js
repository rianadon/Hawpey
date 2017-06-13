'use strict';

const EventEmitter = require('events');

class wsStream extends EventEmitter {
  constructor(type) {
    super();
    this.writable = true;
    this.ws = null;
    this.type = type;
  }
  write(record) {
    if (!this.writable) throw (new Error('wsStream has been ended already'));
    if (this.ws) {
      this.ws.clients.forEach(client => {
        client.send(JSON.stringify({
          type: this.type,
          record,
        }), () => {});
      });
    }
  }
  end() {
    this.writable = false;
  }
  destroy() {
    this.writable = false;
    this.emit('close');
  }
  destroySoon() {
    this.destroy();
  }
  setWs(ws) {
    this.ws = ws;
  }
}
module.exports = wsStream;
