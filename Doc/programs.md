Programs are written in Node.js.
Additionally, each program must begin with the following lines:
```javascript
const h = require('./hawpey-util');
exports.bridge = h.bridge;
```
This imports all of the functions a program needs to work correctly within Hapwy.
You'll most likely also want to add `"use strict"` at the very top to take advantage of some of the new ES2015 features.

Below are all of the functions Hawpey supplies to programs.

### Utilities
#### `t(m, s=0)`
Converts a combination of `m` minutes and `s` seconds to milliseconds.
#### `wait(ms)`
A Promise-ified version of `setTimeout`.
#### `hex(n)`
Returns a hex string of format `0xNN` where NN is `n` in hex.

### Lifecycle
#### `onexit`
A modifiable function that is called when the program is stopped.
It **must** be a Promise.

For example, an open serial port could be closed in this function as shown below.
```javascript
// Hawpey initialization goes here

const SerialPort = require("serialport").SerialPort
const serialPort = new SerialPort("/dev/tty-usbserial1", {
  baudrate: 57600
});

// Rest of program ...

h.onexit = () => new Promise((resolve, reject) => {
	serialPort.close(resolve);
});

```

### Variables
#### `v(object)`
Initialize the program's variables.
Variables are modifiable from the outside and control the behavior of the program without needing to rewrite it.
This should only be called once.

The structure of `object` is:
```javascript
"example": { // The name of the variable
	"value": "val", // The current value of the variable
	"validator": ".*" // regex string specifying how to validate the variable
},
"example2": { // Again, the name
	"value": "val", // Values are always strings
	"validator": "\\d+"
}
```
#### `v(string)`
Returns one of the program's variables whose name equals `string`.
#### `v()`
Returns all of the program's variables.

### Outputs
#### `o(object)`
Initialize the program's outputs.
Outputs allow the program to make sensors and other conditions that might change visible to other devices and the webpage.
This should only be called once.

This is only for outputs that don't have controls. See *Controls* for how to initialize and manipulate controls.

The structure of `object` is:
```javascript
{
	"example": "units", // Example is the name of the output
	"example2": "" // Make units empty for values without units
}
```
#### `o(name, value)`
Set the value of an output whose name is `name` to `value`.
#### `o(name)`
Returns the value of an output whose name is `name`.
#### `o()`
Returns all outputs.

### Controls
#### `c(object)`
Initialize the controls.
Controls can be externally manipulated, and the callback is called whenever the control is changed.

When initialized, they will default to `true` for booleans or the minimum value for sliders.

The structure of `object` is:
```javascript
{
	"example": { // The name of the control
		"type": "boolean", // For on-off switch
		"value": true // optional; sets the initial value
		"change": (newVal, oldVal) => {} // Function to call when value changed
	},
	"example2": { // Again, the name
		"type": "number", // For slider
		"min": 0, // Minimum value of slider, defaults to 0
		"max": 100, // Maximum value of slider, defaults to 100
		"change": (newVal, oldVal) => {
			return old // if nothing is returned,
			           // the control will switch to the new value.
			           // Otherwise, it will switch to whatever was returned.
		}
	}
}
```

Note that the `change` function can also return a `Promise` rather than a value.

#### `c(name, value)`
Set the value of a control whose name is `name` to `value`.
#### `c(name)`
Returns the value of a control whose name is `c`.
#### `c()`
Returns all outputs

### Logging
Hawpey internally uses Bunyan for logging. The program can log to a child logger by calling `l.trace`, `l.debug`, `l.info`, `l.warn`, `l.error`, and `l.fatal`.

These functions simply pass all arguments to the respective function of the child logger, so the syntax for these functions is the same as it is in Bunyan.

### Charts (Plotting)
To plot the status of an output or control to a chart, call `plot(...outputs)` where `outputs` is an array of the names of the outputs or controls to plot.

### Other
#### `err(title, description, reason, resolution)`
Manually notify the master of an error. `description`, `reason`, and `resolution` are all optional.
#### `setTimer(f, delay, ...params)`
Like `setInterval`, but immediately executes the function before calling `setInterval`. Timers set with this function can also be externally monitored and controled.
