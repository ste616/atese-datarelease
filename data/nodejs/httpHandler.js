// This the ATESEDR HTTP handler function.
module.exports = function(request, response) {
  var url = require('url');

  var urlParts = url.parse(request.url, true);
  var path = urlParts.pathname;
  var query = urlParts.query;

  var headers = {
    "content-type": "application/json",
    "charset": "utf-8"
  };

  if (/^\/datarelease\//.test(path)) {
    // The request is for some data from the ATESE data release.
    console.log(query);

    // Figure out the response that we will send back.
    var data = require('./dataHandler');
    var dataResponse = data(query);
    var jsonBack = JSON.stringify(dataResponse);

    if (query.callback) {
      // We return via JSONP.
      response.writeHead(200, headers);
      response.write(query.callback + '(' + jsonBack + ')');
      response.end();
    } else {
      // We return by allow cross-domain queries.
      
      // IE8 does not allow domains to be specified, just the *
      headers["Access-Control-Allow-Origin"] = "*";
      headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
      headers["Access-Control-Allow-Credentials"] = false;
      headers["Access-Control-Max-Age"] = '86400'; // 24 hours
      headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept";
      response.writeHead(200, headers);
      response.write(jsonBack);
      response.end();
    }
  } else {
    // This is a query that we don't support.
    
    response.writeHead(404);
    response.write("Unknown request made.");
    response.end();
  }
};
