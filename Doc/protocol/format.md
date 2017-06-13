Each device must contain a file named `format.json`, which describes how its controls and outputs should be displayed.
For the purposes of brevity, outputs are considered equivalent to controls in this file as they are both formatted in the same way.

Below is an explanation of what each field does:

```javascript
{
  "ignore": [   // Don't display the outputs/controls specified
    "something" // Rules can still be made with these, but their
  ],            // current status won't be shown in the webpage
  "group": {         // Adding controls to a group will display all of them
                     // in the same card on the webpage
    "Name": {        // The name that will be given to the group
      "Name 1": "1", // Each output is given its new name under the group
      "Name 2": "2"  // So "name 1" will be replaced with "1" in this case
    }
  },
  "icons": [
    {
      "output" "Name", // The exact name of the output to assign the icon to
      "function": "<circle cx='50' cy='50' r=${value} fill='#F00' />"
      // As icons are SVGs, this describes what goes inside the svg tag
      // The string is treated as a template literal, so JavaScript expressions
      // are evaluated inside of ${ }
      // the variable value inside of the template literal is either the value
      // of the output or an array of the values of the outputs in a group
    },
    {
      "regex" "Light",
      "function": "<circle cx='50' cy='50' r=${value} fill='#F00' />"
    },
}
```
