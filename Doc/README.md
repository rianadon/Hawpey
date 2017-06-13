##### Welcome to Hawpey's documentation!

There are two main points of interest in this folder.
  * `protocol/`: Details of how to interact with devices running Hawpey
  * `programs.md`: Documentation of the `hawpey-util.js` library

However, before reading these, here is a brief overview of how Hawpey works:

1. #### Hawpey runs on two different types of devices: a *master* and *devices*.

    ##### Devices

    Devices relay and control information from the outside world. A device could be connected to a lightbulb, motion sensor, or whatever you want.

    Note that a device for Hawpey's purposes refers to a webserver running on a computer / microcontroller / anything that can run node.js. So that means that there could be multiple "devices" running on a single computer / whatever.

    ##### Master

    The *master* ties all of the devices together, it hosts the website and proxies all of the webservers of the devices to a single port (that can be exposed to the outside world if you want).

    It also serves the purpose of interacting with services such as your mail server (see more on this later) and handles errors encountered by *devices*.

2. #### Devices have outputs and controls

    In order to control and relay information about the outside world, each device can define its own outputs and controls.

    An output is basically just a reported variable. An output could be the humidity of the air, the temperature of the room, or whether or not a lightbulb is turned on.

    Controls are kind of like light switches. Controls can be either increased or decreased (like a slider) or turned on or off. Controls also have their own output for their state (note that the `hawpey-util.js` library keeps these separate.)

3. #### Devices have triggers

    Through the RESTful API on a device, devices can be automated so that when certain outputs reach specific values or change controls are changed.
