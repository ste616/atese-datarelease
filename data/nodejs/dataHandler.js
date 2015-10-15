// This is the ATESEDR data handling function.
// Begin by getting doing the things that won't need redoing each time we're called.
var misc = require('./misc');

// Load the data release catalogue.
var dataRelease = require("./datarelease_catalogue.json");

// Sort an array in ascending order and return a list of the sorted
// indices.
var sortWithIndices = function(sarr) {
  var srta = []
  // Add the index to each element.
  for (var i = 0; i < sarr.length; i++) {
    srta.push([ sarr[i], i ]);
  }
  srta.sort(function(a, b) {
    return a[0] < b[0] ? -1 : 1;
  });
  for (var j = 0; j < srta.length; j++) {
    srta[j] = srta[j][1];
  }
  
  return srta;
};

// Make a list of all the sources in the catalogue.
var allSources = [];
for (var k in dataRelease) {
  if (dataRelease.hasOwnProperty(k)) {
    // At the same time, we sort the arrays into time order.
    var sortOrder = sortWithIndices(dataRelease[k].mjd);
    for (var a in dataRelease[k]) {
      if (dataRelease[k].hasOwnProperty(a) &&
	  dataRelease[k][a] instanceof Array &&
	  dataRelease[k][a].length == sortOrder.length) {
	t = dataRelease[k][a];
	dataRelease[k][a] = [];
	for (var i = 0; i < sortOrder.length; i++) {
	  dataRelease[k][a].push(t[sortOrder[i]]);
	}
      }
    }
    
    allSources.push(k);
  }
}

var sortedLists = {
  'sortByRA': allSources.concat().sort(misc.sortByRA),
  'sortByTime': allSources.concat().sort(misc.sortByTime)
};

module.exports = function(query) {

  // By default we sort by right ascension.
  var sortFunction = "sortByRA";
  // But we can sort to put the latest observations first.
  if (query.sortBy && query.sortBy == "time") {
    sortFunction = "sortByTime";
  }

  // Return the list of sources if we're asked for them.
  if (query.type && query.type == "sourceList") {
    return { 'sourceList': sortedLists[sortFunction] };
  }

  // Otherwise, we're going to return the JSON describing some sources.
  // By default, we return the first source.
  var sourcesToReturn = [ 0 ];
  // If we've been given a source name, we get its index, which becomes
  // the reference index.
  if (query.source) {
    var a = sortedLists[sortFunction].indexOf(query.source);
    if (a > -1) {
      sourcesToReturn = [ a ];
      // By default we return this index.
      if (query.next) {
	// If we receive the "next" keyword, it means select first the source
	// after the one we were told to select first.
	sourcesToReturn[0] += 1;
      }
    }
  }

  // By default we return only the single source.
  var nsources = 1;
  // But we can be told to return more.
  if (query.nsources) {
    nsources = query.nsources;
  }
  
  // We need to indicate whether we've reached the end of the source list.
  var moreSources = true;
  for (var i = 0; i < (nsources - 1); i++) {
    var nx = sourcesToReturn[i] + 1;
    if (nx < sortedLists[sortFunction].length) {
      sourcesToReturn.push(nx);
    } else {
      // No more sources!
      moreSources = false;
      break;
    }
  }
  
  // Return data on the selected sources.
  var rObj = {};
  var lastSource = "";
  for (var i = 0; i < sourcesToReturn.length; i++) {
    var src = sortedLists[sortFunction][sourcesToReturn[i]]
    rObj[src] = dataRelease[src];
    lastSource = src;
  }
  return { 'data': rObj, 'lastSource': lastSource, 'moreSources': moreSources };
  
};
