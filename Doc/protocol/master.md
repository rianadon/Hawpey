The master's API doesn't do much as it's only functions are:
	* Proxying all devices
	* Managing Errors
	* Serving the webpages

Proxying
--------
All of the properties of the devices are relayed through the master.
Therefore, when a device is added or removed, the master must be notified so that it can change the appropriate proxies

### Managing proxied devices

#### List all devices
HTTP Request: `GET /devices`
###### Response
```javascript
{
	"hostname:2000": { // The hostname or ip address of the device and the port
		"name": "My First Device" // The name given to the device
	},
	"aaa.bbb.ccc.ddd:2000": {
		"name": "2nd device"
	}
}
```

#### Get a specific device
HTTP Request: `GET /devices/<address>`
###### Response
```javascript
{ // The hostname or ip address of the device and the port
	"name": "My First Device" // The name given to the device
}
```

#### Change the name of a device
HTTP Request: `PUT /devices/<address>`
###### Form body
```javascript
{ // The hostname or ip address of the device and the port
	"name": "New name" // The name given to the device
}
```
###### Response
A status code of 204 is returned.

#### Add a new device
HTTP Request: `POST /devices`
###### Form body
```javascript
{ // The hostname or ip address of the device and the port
	"address": "hostname:port",
	"name": "New name", // The name given to the device
}
```
###### Response
A status code of 204 is returned.

#### Delete a device
HTTP Request: `DELETE /devices/<address>`
###### Response
A status code of 204 is returned.

### Using proxied devices
Append whatever path you want to request to `/proxy/<address>/` where address is the `hostname:port` of the device (which is url encoded, of course).
