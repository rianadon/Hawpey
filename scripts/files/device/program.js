"use strict";

const h = require('./hawpey-util');
exports.bridge = h.bridge;

h.v({
	"test": {
		value: "hello",
		validator: /^[a-z]*$/
	}
});
h.o({
	"An output": " in"
});
h.c({
	"A control": {
		type: "boolean",
		change: (newVal, oldVal) => {}
	}
});

h.wait(5000).then(()=> {
	h.l.info("hello");
});
