// This is the node.js application used for the ATESE data release.
var httpHandler = require('./httpHandler');
var http = require('http');

var app = http.createServer(httpHandler);

app.listen(8080);
