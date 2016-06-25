// This is the node.js application used for the ATESE data release.
var httpHandler = require('./httpHandler');
var http = require('http');
//var v6 = require('ipv6').v6;
//var address = new v6.Address("2600:3c01::f03c:91ff:fe89:bc71");

var app = http.createServer(httpHandler);

app.listen(8080);
//app.listen(8080, address);
