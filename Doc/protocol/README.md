Overview
-----------------

With Hawpey, there are two categories of objects: one master, and many devices.
* Devices collect and control information from the outside world. They can also control other devices when a certain circumstances occur.
* Masters allow oversight of these devices. They collect errors and host the main webserver that displays the status of every device.

#### Implementation
Hawpey assumes you have an internal network that all of these devices can connect to. The master can optionally have its webserver ports forwarded to a WAN.


See the other files in `Doc/protocol` for more information.
