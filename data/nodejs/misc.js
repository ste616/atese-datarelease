// This module contains several miscellaneous functions.
var dataRelease = require("./datarelease_catalogue.json");

var ra2decimal = function(r) {
  // Convert a string representing R.A. into a decimal number (keeping it in hours).
    if (typeof r === 'undefined') {
	return 0;
    }
  var e = r.split(":");
  var d = parseFloat(e[0]) + (parseFloat(e[1]) / 60.0) + (parseFloat(e[2]) / 3600.0);
  return d;
};
module.exports.ra2decimal = ra2decimal;

module.exports.sortByRA = function(a, b) {
  // Sort by ascending R.A.
  if (typeof dataRelease[a].raDecimal == 'undefined') {
    dataRelease[a].raDecimal = ra2decimal(dataRelease[a].rightAscension[0]);
  }
  if (typeof dataRelease[b].raDecimal == 'undefined') {
    dataRelease[b].raDecimal = ra2decimal(dataRelease[b].rightAscension[0]);
  }
  return (dataRelease[a].raDecimal - dataRelease[b].raDecimal);
};

module.exports.sortByTime = function(a, b) {
  if (typeof dataRelease[a].maxMjd == 'undefined') {
    dataRelease[a].maxMjd = Math.max.apply(Math, dataRelease[a].mjd);
  }
  if (typeof dataRelease[b].maxMjd == 'undefined') {
    dataRelease[b].maxMjd = Math.max.apply(Math, dataRelease[b].mjd);
  }
  return (dataRelease[b].maxMjd - dataRelease[a].maxMjd);
};
