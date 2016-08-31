define( [ "dojo/request/xhr", "astrojs/skyCoordinate", "astrojs/base", "astrojs/coordinate",
	  "astrojs/time", "dojo/_base/lang", "dojo/number" ],
	function(xhr, skyCoord, astrojs, coord, astroTime, lang, number) {

	   // The object we return to our caller.
	   var rObj = {};

	   // Some private variables that we use throughout.
	   var _sortMethod = "ra"; // By default, we ask for the sources in R.A. order.
	   var _defaultNumSources = 100; // The number of sources to get from the server at once.
	   var _lastFrequency = 5500, _lastSpectralIndexLowFlat = -0.2, _lastSpectralIndexHighFlat = 0.2;
	   
	   var _inFlight = false; // Set to true when a Node.js query is made.
	   // The storage.
	   var _sourceStorage = {};
	   var _sourceLists = {};
	   var _sourceKeys = {};
	   var _sourceSelections = {};
	   // Indicators for the range of sources we currently have.
	   var _sourceIndices = {};

	   // Storage for our page clients to keep state.
	   var _clientStorage = {};
	   
	   // Our private methods.

	   // The routine that handles communications with the Node.js server.
	   var _comms_node = function(q) {
	     // Where do we go to get the data?
	     var hostName = window.location.hostname;
	     var protocol = window.location.protocol;

	     // Automatically add the sorting method to each query so our
	     // callers don't have to.
	     q.sortBy = _sortMethod;

	     // Mark the query as started and begin the data request.
	     _inFlight = true;
	     var p = xhr(protocol + "//" + hostName + "/node/datarelease/", {
	       'handleAs': "json",
	       'query': q
	     });

	     // Return our promise.
	     return p;
	   };

	   
	   // Go through the source storage and determine the range of sources
	   // in the source list that we actually have.
	  var _indexSources = function() {
	     // Initialise our source index if it doesn't yet exist.
	     if (typeof _sourceIndices[_sortMethod] === 'undefined') {
	       _sourceIndices[_sortMethod] = { 'min': -1, 'max': -1 };
	     }

	     // Check we actually have information about the current sorting
	     // method.
	     if (typeof _sourceLists[_sortMethod] === 'undefined' ||
		 typeof _sourceKeys[_sortMethod] === 'undefined') {
	       return;
	     }
	     
	     for (var s in _sourceStorage) {
	       if (_sourceStorage.hasOwnProperty(s) &&
		   _sourceKeys[_sortMethod].hasOwnProperty(s)) {
		 if (_sourceIndices[_sortMethod].min === -1 ||
		     _sourceKeys[_sortMethod][s] < _sourceIndices[_sortMethod].min) {
		   _sourceIndices[_sortMethod].min = _sourceKeys[_sortMethod][s];
		 }
		 if (_sourceIndices[_sortMethod].max === -1 ||
		     _sourceKeys[_sortMethod][s] > _sourceIndices[_sortMethod].max) {
		   _sourceIndices[_sortMethod].max = _sourceKeys[_sortMethod][s];
		 }
	       }
	     }

	   };
	     
	   // Method to get the entire list of sources in the sort order that
	   // we've requested, and cache it.
	   var _get_source_list = function() {
	     return _comms_node({ 'type': "sourceList" }).then(function(data) {
	       if (typeof(data) !== 'undefined' &&
		   typeof(data.sourceList) !== 'undefined') {
		 _sourceLists[_sortMethod] = data.sourceList;

		 // Turn the array into an object that has the source name as
		 // the key, and the index as the value.
		 _sourceKeys[_sortMethod] = {};
		 for (var i = 0; i < _sourceLists[_sortMethod].length; i++) {
		   _sourceKeys[_sortMethod][_sourceLists[_sortMethod][i]] = i;
		   // Add flags for selections.
		   if (!(_sourceLists[_sortMethod][i] in _sourceSelections)) {
		     _sourceSelections[_sourceLists[_sortMethod][i]] = false;
		   }
		 }


	       }

	       // Index the sources.
	       _indexSources();
	       
	       return data;
	     });
	   };

	  // Method to find valid minimum and maximum values from an array.
	  var _calculate_minmax = function(arr) {
	    if (typeof arr === "undefined") {
	      return;
	    }
	    var arrd = arr.filter(function(a) { return isFinite(a) && !isNaN(a) && !(a === 999); });
	    var min = Math.min.apply(null, arrd);
	    var max = Math.max.apply(null, arrd);
	    return { 'min': min, 'max': max };
	  };

	  var _calculateSourceMinMax = function(s) {
	    if (typeof _sourceStorage[s] === 'undefined') {
	      return;
	    }

	    // Compute the minimum and maximum values for each parameter that it makes
	    // sense for.
	    _sourceStorage[s].minmax = {
	      'closurePhase': {},
	      'absClosurePhase': {},
	      'defect': {},
	      'fluxDensity': {},
	      'mjd': {},
	      'solarAngles': {},
	    };
	    for (var mm in _sourceStorage[s].minmax) {
	      if (_sourceStorage[s].minmax.hasOwnProperty(mm)) {
		_sourceStorage[s].minmax[mm] = _calculate_minmax(_sourceStorage[s][mm]);
	      }
	    }
	    _sourceStorage[s].minmax.selected = true;
	    _sourceStorage[s].minmax['closest5.5'] =
	      _calculate_minmax(_getValue(_sourceStorage[s], [ 'fluxDensityFit', 'closest5.5', 1 ]).map(Math.log10));
	    _sourceStorage[s].minmax['fitScatter'] =
	      _calculate_minmax(_getValue(_sourceStorage[s], [ 'fluxDensityFit', 'fitScatter' ]).map(Math.log10));
	    _sourceStorage[s].minmax['numMeasurements'] =
	      _calculate_minmax([ Math.log10(_sourceStorage[s]['mjd'].length) ]);
	  };
	   
	   // Method to go through a list of sources coming from the Node.js server
	   // and do some useful things.
	   var _parseSources = function(data) {
	     // console.log(data);
	     if (typeof(data) !== 'undefined') {
	       var dref = data;
	       if (typeof(data.data) !== 'undefined') {
		 dref = data.data;
	       }
	       for (var s in dref) {
		 if (dref.hasOwnProperty(s) &&
		     !_sourceStorage.hasOwnProperty(s)) {
		   _sourceStorage[s] = dref[s];
		   // Turn the right ascension and declination into a SkyCoord.
		   var l = dref[s].rightAscension.length - 1;
		   if (l > 0) {
		     var sc = skyCoord.new({
		       'ra': {
			 'value': astrojs.hexa2turns(dref[s].rightAscension[l], {
			   'units': "hours"
			 }),
			 'units': "turns"
		       },
		       'dec': dref[s].declination[l],
		       'frame': "J2000"
		     });
		     _sourceStorage[s].coordinate = sc;
		   } else {
		     _sourceStorage[s].coordinate = null;
		   }
		   // Replace any -999 in the closure phases with the average value.
		   if (dref[s].closurePhase.indexOf(-999) > -1) {
		     var filclp = dref[s].closurePhase.filter(_scrubArray(-999));
		     var avgclp = number.round(filclp.reduce(function(p, c) {
		       return (p + c);
		     }, 0) / (filclp.length || 1), 3);
		     var tmpclp = dref[s].closurePhase.map(function(a) {
		       if (a === -999) {
			 return avgclp;
		       }
		       return a;
		     });
		     dref[s].closurePhase = tmpclp;
		   }
		   // Replace any 0 in the defects with 0.1.
		   if (dref[s].defect.indexOf(0) > -1) {
		     var tmpdef = dref[s].defect.map(function(a) {
		       if (a === 0) {
			 return 0.1;
		       }
		       return a;
		     });
		     dref[s].defect = tmpdef;
		   }
		   // Replace any 0 in the fit scatters with 0.001.
		   for (var i = 0; i < dref[s].fluxDensityFit.length; i++) {
		     if (dref[s].fluxDensityFit[i].fitScatter === 0) {
		       dref[s].fluxDensityFit[i].fitScatter = 0.001;
		     }
		   }
		   
		   // Compute the absolute value of the closure phase.
		   _sourceStorage[s].absClosurePhase =
		     dref[s].closurePhase.map(Math.abs);

		   _calculateSourceMinMax(s);
		   
		   // An indicator of whether calculations are up to date.
		   _sourceStorage[s].upToDate = false;
		 }
	       }

	       // Index the sources.
	       _indexSources();
	       
	       return data;
	     } else {
	       return;
	     }
	   };

	   // Method to get a set of sources.
	   var _getSources = function(src, nsrc, includeSource) {
	     // The query object.
	     var cobj = {};

	     if (src != null) {
	       // We have been given a source to start with.
	       cobj.source = src;
	     }

	     if (nsrc !== 0) {
	       cobj.nsources = nsrc;
	     } else {
	       // By default we ask for 100 sources.
	       cobj.nsources = _defaultNumSources;
	     }

	     if (includeSource) {
	       cobj.next = false;
	     } else {
	       cobj.next = true;
	     }
	     
	     return _comms_node(cobj).then(_parseSources);
	   };

	   // Method to get all the entire catalogue.
	   var _getCatalogue = function() {
	     var c = xhr("datarelease/datarelease_catalogue.json", {
	       'handleAs': "json"
	     });

	     return c.then(_parseSources).then(function(d) {
	       _sourceLists['random'] = [];
	       for (var s in _sourceStorage) {
		 if (_sourceStorage.hasOwnProperty(s)) {
		   _sourceLists['random'].push(s);
		 }
	       }
	       return d;
	     });
	   };
	   
	   // Take a flux model and return the flux density at the
	   // specified frequency.
	   var _fluxModel2Density = function(model, frequency) {
	     // The frequency should be in MHz, but the model will require
	     // it in GHz.
	     var f = frequency / 1000;
	     var isLog = (model[model.length - 1] === 'log');
	     if (isLog) {
	       f = Math.log(f) / Math.log(10);
	     }
	     var s = parseFloat(model[0]);
	     for (var i = 1; i < model.length; i++) {
	       if (i === model.length - 1) {
		 break;
	       }
	       s += parseFloat(model[i]) * Math.pow(f, i);
	     }
	     if (isLog) {
	       s = Math.pow(10, s);
	     }
	     return s;
	   };

	   // Take a flux model and return the log S - log v slope
	   // (the spectral index) at a specified frequency, by
	   // taking the derivative and evaluating.
	   var _fluxModel2Slope = function(model, frequency) {
	     // The frequency should be in MHz, but the model will require
	     // it in GHz.
	     var isLog = (model[model.length - 1] === 'log');
	     var f = Math.log(frequency / 1000) / Math.log(10);
	     // This only works if we have a log/log model.
	     if (!isLog) {
	       // We get the derivative of the general function
	       // S = a + bv + cv^2
	       // after being transformed to log S
	       // log S = log(a + bv + cv^2)
	       // by substituting x = log v, thus v = 10^x
	       // Then dlog S/dx is solved by Wolfram Alpha to be
	       // 10^x (b + 2^(x+1) * 5^x * c) / (a + 10^x * (b + c * 10^x))
	       
	       // Check that we only have order 2 or below.
	       if ((model.length - 1) > 3) {
		 return null;
	       }
	       var a = (model.length >= 2) ? parseFloat(model[0]) : 0;
	       var b = (model.length >= 3) ? parseFloat(model[1]) : 0;
	       var c = (model.length == 4) ? parseFloat(model[2]) : 0;
	       var s = Math.pow(10, f) * (b + Math.pow(2, (f + 1)) *
					  Math.pow(5, f) * c) /
		   (a + Math.pow(10, f) * (b + c * Math.pow(10, f)));
	       return s;
	     }
	     var s = 0;
	     for (var i = 1; i < model.length; i++) {
	       if (i === model.length - 1) {
		 break;
	       }
	       s += parseFloat(model[i]) * i * Math.pow(f, (i - 1));
	     }
	     return s;
	   };

	   // A helper method to take a JSON object and convert it to
	   // a flux density, but as a function that can be accepted by
	   // the Array map method.
	   var _fluxDensityAtFrequency = function(freq) {
	     return function(a) {
	       return _fluxModel2Density(a.fitCoefficients, freq);
	     };
	   };

	   // A helper method to take a JSON object and convert it to
	   // a spectral index, but as a function that can be accepted by
	   // the Array map method.
	   var _spectralIndexAtFrequency = function(freq) {
	     return function(a) {
	       return _fluxModel2Slope(a.fitCoefficients, freq);
	     };
	   };

	   // A helper method to take a JSON object and return a value
	   // that indicates whether the frequency of the fit would be
	   // valid for that epoch, but as a function that can be accepted
	   // by the Array map method.
	   var _fluxValidAtFrequency = function(freq) {
	     return function(a) {
	       return (((freq / 1000.0) >= a.frequencyRange[0]) &&
		       ((freq / 1000.0) <= a.frequencyRange[1]));
	     };
	   };
	   
	   // A helper method to filter flux densities based on their
	   // frequency validity, but as a function that can be accepted
	   // by the Array filter method.
	   var _fluxValidFilter = function(validArr) {
	     return function(a, idx) {
	       return validArr[idx];
	     };
	   };

	   // A helper method to take a spectral index value and return
	   // the classification dependent on the range accepted as flat, but
	   // as a function that can be accepted by the Array map method.
	   var _classifySpectralIndex = function(lowFlat, highFlat) {
	     return function(a) {
	       if (a < lowFlat) {
		 return "steep";
	       } else if (a <= highFlat) {
		 return "flat";
	       } else {
		 return "inverted";
	       }
	     };
	   };

	   // Return the average value of an array.
	   var _arrayAverage = function(a) {
	     var sum = a.reduce(function(x, y) { return (x + y) });
	     return (sum / a.length);
	   };

	   // Return the difference in frequency between the current channel
	   // and the one after it.
	   var _freqSpace = function(v, i, a) {
	     if (i == (a.length - 1)) {
	       return 0;
	     }
	     return (a[i + 1][0] - v[0]);
	   };

	   // Recursive method to get a value from a path in JSON.
	   var _getValue = function(r, p) {

	     // Grab the next path element.
	     if (r === null) {
	       // Bad, return nothing.
	       return;
	     }
	     var d = r[p[0]];
	     // console.log('getValue');
	     // console.log(r);
	     // console.log(p);
	     // console.log(d);
	     
	     // Return bad if can't find the path element.
	     if (typeof(d) == 'undefined') {
	       return undefined;
	     }

	     // Return the value if we are at the last path element.
	     if (p.length == 1) {
	       return d;
	     }

	     var p2 = lang.clone(p);
	     p2.shift();

	     // Is d an array?
	     if ((Array.isArray(d)) && ((p2.length > 1) || (Number.isInteger(p2[p2.length - 1]) == false))) {
	       var a = [];
	       for (var i = 0; i < d.length; i++) {
		 a.push(_getValue(d[i], p2));
	       }
	       return a;
	     }

	     // Otherwise get rid of the first element of the path and continue.
	     return _getValue(d, p2);
	     
	   };
	   
	   
	   // Our public methods.

	   // Assign some pointers to the internal methods.
	   rObj.fluxModel2Density = _fluxModel2Density;
	   
	   // Method to get the whole catalogue.
	   rObj.getCatalogue = _getCatalogue;

	  // Get minimum and maximum values of an array.
	  rObj.calculate_minmax = _calculate_minmax;
	  
	   // Method to get the first set of sources from the server.
	   var _getFirstSources = function(firstSource) {
	     if (typeof firstSource === 'undefined') {
	       firstSource = null;
	     }
	     // Use our general method to do this.
	     return _getSources(firstSource, 0, true);
	   };
	   rObj.getFirstSources = _getFirstSources;

	   // Method to get more sources either before the current list, or
	   // after it.
	   var _getMoreSources = function(direction) {
	     // Check that we can automatically determine the parameters
	     // we need.
	     if (typeof _sourceLists[_sortMethod] === 'undefined' ||
		 typeof _sourceIndices[_sortMethod] === 'undefined') {
	       return undefined;
	     }
	     if (direction === "after") {
	       return _getSources(_sourceLists[_sortMethod][_sourceIndices[_sortMethod].max + 1],
				  0, true);
	     } else if (direction === "before") {
	       var sindex = _sourceIndices[_sortMethod].min - _defaultNumSources;
	       if (sindex < 0) {
		 sindex = 0;
	       }
	       return _getSources(_sourceLists[_sortMethod][sindex], 0, true);
	     }
	   };
	   rObj.getMoreSources = _getMoreSources;
	   
	   // Method to set the sorting of the source list.
	   var _setSorting = function(v) {
	     // Can't change sorting method while a request is in flight.
	     if (_inFlight) {
	       return rObj;
	     }
	     
	     // We support either time or R.A. or random sorting.
	     if (v === 'ra' || v === 'time' || v === 'random') {
	       _sortMethod = v;
	     }

	     // Return ourselves for method chaining.
	     return rObj;
	   };
	   rObj.setSorting = _setSorting;

	   // Method to return the sorting order method.
	   var _getSorting = function() {
	     return _sortMethod;
	   };
	   rObj.getSorting = _getSorting;

	   // Return the number of epochs observed for a named source.
	   var _numEpochs = function(src) {
	     // Check the source is actually in the data.
	     if (_sourceStorage.hasOwnProperty(src)) {
	       return _sourceStorage[src].epochs.length;
	     } else {
	       return -1;
	     }
	   };
	   rObj.numEpochs = _numEpochs;

	   // Add a property to the source storage.
	   var _addSourceProperty = function(src, propName, val) {
	     if (_sourceStorage.hasOwnProperty(src)) {
	       _sourceStorage[src][propName] = val;
	       return true;
	     }
	     return false;
	   };
	   rObj.addSourceProperty = _addSourceProperty;
	   rObj.setSourceProperty = _addSourceProperty;
	   
	   // Get a property from the source storage.
	   var _getSourceProperty = function(src, propName) {
	     if (_sourceStorage.hasOwnProperty(src) &&
		 _sourceStorage[src].hasOwnProperty(propName)) {
	       return _sourceStorage[src][propName];
	     } else {
	       return undefined;
	     }
	   };
	   rObj.getSourceProperty = _getSourceProperty;

	   // Set a property in the source storage for all current sources.
	   var _setAllSourcesProperty = function(propName, val) {
	     for (var i = 0; i < _sourceLists[_sortMethod].length; i++) {
	       _addSourceProperty(_sourceLists[_sortMethod][i], propName, val);
	     }
	   };
	   rObj.setAllSourcesProperty = _setAllSourcesProperty;

	   // Reset a property in the source storage for all current sources,
	   // only if the property already exists for it.
	   var _resetAllSourcesProperty = function(propName, val) {
	     for (var i = 0; i < _sourceLists[_sortMethod].length; i++) {
	       if (typeof _getSourceProperty(_sourceLists[_sortMethod][i], propName) !== 'undefined') {
		 _addSourceProperty(_sourceLists[_sortMethod][i], propName, val);
	       }
	     }
	   };
	   rObj.resetAllSourcesProperty = _resetAllSourcesProperty;
	   
	   // Get the list of sources in the requested order.
	   var _getSourceList = function() {
	     // Check for the cached version.
	     if (typeof(_sourceLists[_sortMethod]) !== 'undefined') {
	       // Return straight away.
	       return _sourceLists[_sortMethod];
	     } else {
	       // Request the data, then return.
	       return _get_source_list().then(function(d) {
		 return _sourceLists[_sortMethod];
	       });
	     }
	   };
	   rObj.getSourceList = _getSourceList;

	   // Return all the information pertaining to the flux densities for a source.
	   var _getFluxDensityInformation = function(src) {
	     if (_sourceStorage.hasOwnProperty(src)) {
	       return {
		 'computedFluxDensity': _sourceStorage[src].computedFluxDensity,
		 'computedSpectralIndex': _sourceStorage[src].computedSpectralIndex,
		 'siClassification': _sourceStorage[src].siClassification,
		 'maxFluxDensity': _sourceStorage[src].maxFluxDensity,
		 'avgFluxDensity': _sourceStorage[src].avgFluxDensity,
		 'fitValid': _sourceStorage[src].fitValid
	       };
	     } else {
	       return undefined;
	     }
	   };
	   rObj.getFluxDensityInformation = _getFluxDensityInformation;

	   // Compute all the flux densities and spectral indices for a particular
	   // source at some frequency.
	   var _computeSource = function(src, frequency, lowFlat, highFlat) {
	     // Check for the frequency and spectral index options, and fill them if necessary.
	     if (typeof frequency === 'undefined') {
	       frequency = _lastFrequency;
	     } else {
	       _lastFrequency = frequency;
	     }
	     if (typeof lowFlat === 'undefined') {
	       lowFlat = _lastSpectralIndexLowFlat;
	     } else {
	       _lastSpectralIndexLowFlat;
	     }
	     if (typeof highFlat === 'undefined') {
	       highFlat = _lastSpectralIndexHighFlat;
	     } else {
	       _lastSpectralIndexHighFlat = highFlat;
	     }
	     
	     if (_sourceStorage.hasOwnProperty(src)) {
	       // Check if we need to do anything.
	       if (!_sourceStorage[src].upToDate) {
		 // Calculate the flux densities and spectral indices.
		 _sourceStorage[src].computedFluxDensity =
		   _sourceStorage[src].fluxDensityFit.map(_fluxDensityAtFrequency(frequency));
		 _sourceStorage[src].computedSpectralIndex =
		   _sourceStorage[src].fluxDensityFit.map(_spectralIndexAtFrequency(frequency));
		 _sourceStorage[src].fitValid =
		       _sourceStorage[src].fluxDensityFit.map(_fluxValidAtFrequency(frequency));

		 // Classify the spectral indices.
		 _sourceStorage[src].siClassification =
		   _sourceStorage[src].computedSpectralIndex.map(_classifySpectralIndex(lowFlat, highFlat));

		 // Compute the average and maximum flux densities.
		 _sourceStorage[src].maxFluxDensity =
		   Math.max.apply(this,
				  _sourceStorage[src].computedFluxDensity.filter(
				      _fluxValidFilter(_sourceStorage[src].fitValid)
				  ));
		 _sourceStorage[src].avgFluxDensity =
 		       _arrayAverage(_sourceStorage[src].computedFluxDensity.filter(
			   _fluxValidFilter(_sourceStorage[src].fitValid)
		       ));
		 
		 // Mark it as computed now.
		 _sourceStorage[src].upToDate = true;
	       }
	     }
	     return _getFluxDensityInformation(src);
	   };
	   rObj.computeSource = _computeSource;

	   // Return all the information about a measurement of a source in the nth
	   // epoch.
	   var _getEpochInformation = function(src, n) {
	     if (_sourceStorage.hasOwnProperty(src) &&
		 _sourceStorage[src].epochs.length > n) {
	       return {
		 'epoch': _sourceStorage[src].epochs[n],
		 'closurePhase': _sourceStorage[src].closurePhase[n],
		 'declination': _sourceStorage[src].declination[n],
		 'defect': _sourceStorage[src].defect[n],
		 'fluxDensityScatter': _sourceStorage[src].fluxDensityFit[n].fitScatter,
		 'mjd': _sourceStorage[src].mjd[n],
		 'rightAscension': _sourceStorage[src].rightAscension[n],
		 'solarAngle': _sourceStorage[src].solarAngles[n],
		 'frequencyRange': _sourceStorage[src].fluxDensityFit[n].frequencyRange
	       };
	     } else {
	       return undefined;
	     }
	   };
	   rObj.getEpochInformation = _getEpochInformation;

	   // Return the epoch name for the nth epoch.
	   var _getEpochName = function(src, n) {
	     if (_sourceStorage.hasOwnProperty(src) &&
		 _sourceStorage[src].epochs.length > n) {
	       return _sourceStorage[src].epochs[n];
	     } else {
	       return undefined;
	     }
	   }
	   rObj.getEpochName = _getEpochName;
	   
	   // Get the spectral information for a source's nth epoch.
	   var _getEpochSpectrum = function(src, n, col, avg) {
	     // Set a default averaging.
	     if (typeof avg === 'undefined') {
	       avg = 1;
	     } else {
	       avg = parseInt(avg);
	     }
	     if (_sourceStorage.hasOwnProperty(src) &&
		 _sourceStorage[src].epochs.length > n) {

	       // Assign the colour to the epoch.
	       if (typeof col !== 'undefined' && col) {
		 if (typeof _sourceStorage[src].specColour === 'undefined') {
		   _sourceStorage[src].specColour =
		     _sourceStorage[src].epochs.map(function() { return 0; });
		 }
		 _sourceStorage[src].specColour[n] = col;
	       }

	       // Set up the cache array if required.
	       if (typeof _sourceStorage[src].spectralData === 'undefined') {
		 _sourceStorage[src].spectralData =
		   _sourceStorage[src].epochs.map(function() { return null; });
	       }

	       if (_sourceStorage[src].spectralData[n] !== null) {
		 // We already have this data, we return it immediately.
		 return _sourceStorage[src].spectralData[n];
	       } else {
		 // Form the file name.
		 var epoch = _sourceStorage[src].epochs[n];
		 var efname = epoch + "/" + src + "_" + epoch;
		 if (avg === 32 || avg === 64 || avg == 128) {
		   efname += ".averaged" + avg;
		 }
		 efname += ".json";

		 // Grab the file.
		 return xhr.get("datarelease/" + efname, {
		   'handleAs': "json"
		 }).then(function(data) {
		   if (typeof data === 'undefined') {
		     return undefined;
		   }
		   if (typeof col !== 'undefined' && col) {
		     data.specColour = col;
		   }
		   _sourceStorage[src].spectralData[n] = data;

		   // Do some reformatting of the data to make it more useful.

		   // Reformat the data to be compatible with a Dojo chart.
		   var sdata = null;
		   var fspacing = null;
		   for (var i = 0; i < data.fluxDensityData.length; i++) {
		     if (data.fluxDensityData[i].stokes === "I") {
		       sdata = data.fluxDensityData[i].data.map(function(a) {
			 return { 'x': a[0], 'y': a[1] };
		       });
		       // Also, determine the spacing in frequency between each channel.
		       fspacing = data.fluxDensityData[i].data.map(_freqSpace);
		     }
		   }
		   // We'll return the reformatted data.
		   _sourceStorage[src].spectralData[n].chartData = sdata;

		   // Determine the contiguous frequency chunks that can be plotted
		   // without gaps.
		   var maxFreqSpacing = 0.14; // Allow up to 140 MHz gaps, but no more.
		   var startIndex = [ 0 ];
		   var endIndex = [];
		   for (var i = 1; i < fspacing.length; i++) {
		     if (fspacing[i] > maxFreqSpacing) {
		       endIndex.push(i);
		       startIndex.push(i + 1);
		       i++;
		     }
		   }
		   endIndex.push(fspacing.length);
		   _sourceStorage[src].spectralData[n].chartChunks = {
		     'startIndex': startIndex,
		     'endIndex': endIndex
		   };
		   
		   return _sourceStorage[src].spectralData[n];
		 });
	       }
	     } else {
	       return undefined;
	     }
	   };
	   rObj.getEpochSpectrum = _getEpochSpectrum;

	   // This method takes two objects, and copies any properties from
	   // the src object into the dest object, optionally checking for
	   // an existing property in dest to prevent the copying.
	   var _mixObj = function(src, dest, opt) {
	     // Check for an options object.
	     if (typeof opt === 'undefined') {
	       opt = {};
	     }
	     // Check for the overwrite property in the opt object.
	     if (typeof opt.overwrite === 'undefined') {
	       // By default we overwrite exisiting properties in dest.
	       opt.overwrite = true;
	     }
	     // Check for the onlyDestination property in the opt object.
	     if (typeof opt.onlyDestination) {
	       // By default we copy everything in the src to the dest.
	       opt.onlyDestination = false;
	     } // Otherwise, we only copy values in src that already exist in dest.
	     
	     // Go through the properties in src.
	     if (typeof src !== 'undefined' &&
		 typeof dest !== 'undefined') {
	       for (var p in src) {
		 if (src.hasOwnProperty(p)) {
		   if (!opt.onlyDestination ||
		       dest.hasOwnProperty(p)) {
		     if (typeof dest[p] === 'undefined' || opt.overwrite) {
		       dest[p] = src[p];
		     }
		   }
		 }
	       }
	     }
	   };
	   rObj.mixObj = _mixObj;

	   // This method scans an object for string values that really
	   // should be Boolean and converts them.
	   var _checkBools = function(o) {
	     if (typeof o !== 'undefined') {
	       for (var p in o) {
		 if (o.hasOwnProperty(p) &&
		     (o[p] === "true" || o[p] === "false")) {
		   o[p] = (o[p] === "true");
		 }
	       }
	     }
	   };
	   rObj.checkBools = _checkBools;

	   // This method returns the index range for the sources we currently know
	   // about.
	   var _getIndexRange = function() {
	     return _sourceIndices[_sortMethod];
	   };
	   rObj.getIndexRange = _getIndexRange;

	   // This method returns the number of sources that are known about.
	   var _numberSourcesAvailable = function() {
	     return _sourceLists[_sortMethod].length;
	   };
	   rObj.numberSourcesAvailable = _numberSourcesAvailable;
	   
	   // This method returns the number of sources that have been loaded.
	   var _numberSourcesLoaded = function() {
	     return (_sourceIndices[_sortMethod].max - _sourceIndices[_sortMethod].min + 1);

	   };
	   rObj.numberSourcesLoaded = _numberSourcesLoaded;

	   // This method is used to cycle through all the evaluators for
	   // particular source. Returns true if all the evaluators also return
	   // true, or false otherwise.
	   var _evaluateConditions = function(src, routines, options) {
	     // Our return value;
	     var r = true;

	     // Make a default options object if necessary.
	     if (typeof options === 'undefined') {
	       options = {
		 'compute': false
	       };
	     }

	     if (options.compute) {
	       // Need to ensure the computed quantities have been made.
	       _computeSource(src);
	     }
	     
	     for (var e in routines) {
	       if (routines.hasOwnProperty(e)) {
		 r = r && routines[e](_sourceStorage[src]);
		 if (!r) {
		   return r;
		 }
	       }
	     }
	     return r;
	   };
	   rObj.evaluateConditions = _evaluateConditions;

	   // Method that returns if a source is selected.
	   var _get_source_selection = function(src) {
	     if (!(src in _sourceSelections)) {
	       // The source isn't in our list.
	       return false;
	     }
	     return _sourceSelections[src];
	   };
	   rObj.sourceSelected = _get_source_selection;

	   // Method that sets the source selection.
	   var _set_source_selection = function(src, state) {
	     if (src in _sourceSelections &&
		 (state === true || state === false)) {
	       _sourceSelections[src] = state;
	     }
	   };
	   rObj.setSourceSelection = _set_source_selection;
	   
	   // Method that de-selects a source.
	   var _deselect_source = function(src) {
	     _set_source_selection(src, false);
	   };
	   rObj.deselectSource = _deselect_source;

	   // Method that selects a source.
	   var _select_source = function(src) {
	     _set_source_selection(src, true);
	   };
	   rObj.selectSource = _select_source;

	   // Method that toggles the source selection.
	   var _toggle_source_selection = function(src) {
	     if (src in _sourceSelections) {
	       _sourceSelections[src] = !_sourceSelections[src];
	       return _sourceSelections[src];
	     }
	     return false;
	   };
	   rObj.toggleSourceSelection = _toggle_source_selection;

	   // Method that returns a list of all the selected sources.
	   var _selected_sources = function() {
	     var srclist = [];
	     for (var src in _sourceSelections) {
	       if (_sourceSelections[src]) {
		 srclist.push(src);
	       }
	     }
	     return srclist;
	   };
	   rObj.selectedSources = _selected_sources;

	  // Method to make an array of some length filled with the same value.
	  var _filledArray = function(l, v) {
	    for (var a = [], i = 0; i < l; i++) {
	      a[i] = v;
	    }
	    return a;
	  };
	  
	   // Method that gets a value from all the sources using a JSON path.
	  var _valueAllSources = function(path, options) {
	    if (typeof options === 'undefined') {
	      options = {};
	    }
	    var d = [];
	    var sd = [];
	    for (var i = 0; i < _sourceLists[_sortMethod].length; i++) {
	      var s = _sourceLists[_sortMethod][i];
	      var sref = _sourceStorage[s];
	      if ((options.minmaxSelection &&
		   sref.hasOwnProperty("minmax") &&
		   sref.minmax.selected) ||
		  (!options.minmaxSelection)) {
		var av = _getValue(sref, path);
		d.push(av);
		sd.push(_filledArray(av.length, s));
	      }
	    }
	    
	    var rd = [].concat.apply([], d);
	    var rsd = [].concat.apply([], sd);
	    
	    if (typeof options.log !== 'undefined' &&
		options.log === true) {
	      // Return the log values.
	      rd = rd.map(Math.log10);
	    }
	    if (typeof options.flatten !== 'undefined' &&
		options.flatten === false) {
	      // Don't flatten the arrays.
	      rd = d;
	      rsd = sd;
	    }
	    
	    if (typeof options.includeSources !== 'undefined' &&
		options.includeSources === true) {
	      return { 'values': rd, 'sources': rsd };
	    }
	    return rd;
	  };
	  rObj.valueAllSources = _valueAllSources;

	  // Method to remove the epoch of source s at index e.
	  var _removeSourceEpoch = function(s, e) {
	    var removals = [ 'absClosurePhase', 'arrayConfigurations', 'closurePhase',
			     'declination', 'defect', 'epochs', 'fluxDensity',
			     'fluxDensityFit', 'hourAngle', 'mjd', 'rightAscension',
			     'solarAngles' ];
	    for (var i = 0; i < removals.length; i++) {
	      if (typeof _sourceStorage[s] !== 'undefined' &&
		  typeof _sourceStorage[s][removals[i]] !== 'undefined' &&
		  _sourceStorage[s][removals[i]].length > e) {
		_sourceStorage[s][removals[i]].splice(e, 1);
	      }
	    }
	  };
	  
	  // Method to strip out measurements that don't include the specified frequency
	  // (in GHz).
	  var _stripMeasurements = function(f) {
	    for (var i = 0; i < _sourceLists[_sortMethod].length; i++) {
	      var s = _sourceLists[_sortMethod][i];
	      var sref = _sourceStorage[s];
	      for (var j = sref.fluxDensityFit.length - 1; j >= 0; j--) {
		if (sref.fluxDensityFit[j].frequencyRange[0] > f ||
		    sref.fluxDensityFit[j].frequencyRange[1] < f) {
		  _removeSourceEpoch(s, j);
		}
	      }
	      // Update the minmax object now.
	      _calculateSourceMinMax(s);
	    }
	  };
	  rObj.stripMeasurements = _stripMeasurements;
	  
	  // Method to get rid of any value that we don't like from an array, presented
	  // as a function that can be passed to Array.filter.
	  var _scrubArray = function(v) {
	    return function(a) {
	      return !(a === v);
	    };
	  };
	  rObj.scrubArray = _scrubArray;

	  // Method to do a deep mixing of objects.
	  var _mixin = function(a, b) {
	    for (var s in a) {
	      if (a.hasOwnProperty(s) && (a[s] === Object(a[s])) &&
		  b.hasOwnProperty(s)) {
		_mixin(a[s], b[s]);
		delete b[s];
	      }
	    }
	    lang.mixin(a, b);
	  };
	  rObj.mixin = _mixin;
	  
	  // Method to take an array of arrays, and set them as minmax values for each
	  // source.
	  var _store_minmax = function(arr, mmname) {
	    if (_sourceLists[_sortMethod].length !== arr.length) {
	      // This won't work.
	      return;
	    }

	    for (var i = 0; i < _sourceLists[_sortMethod].length; i++) {
	      _sourceStorage[_sourceLists[_sortMethod][i]].minmax[mmname] =
		_calculate_minmax(arr[i]);
	    }
	  };
	  rObj.store_minmax = _store_minmax;

	  // Method to restrict selection of sources based on a value that has
	  // been evaluated in the minmax object.
	  var _restrictSelection_minmax = function(minmaxPar, valueLow, valueHigh) {
	    for (var s in _sourceStorage) {
	      if (_sourceStorage.hasOwnProperty(s) &&
		  _sourceStorage[s].hasOwnProperty("minmax") &&
		  _sourceStorage[s].minmax.hasOwnProperty(minmaxPar)) {
		if (((_sourceStorage[s].minmax[minmaxPar].min >= valueLow) &&
		     (_sourceStorage[s].minmax[minmaxPar].min <= valueHigh)) ||
		    ((_sourceStorage[s].minmax[minmaxPar].max >= valueLow) &&
		     (_sourceStorage[s].minmax[minmaxPar].max <= valueHigh))) {
		  // This actually works but we don't re-select, just de-select.
		  continue;
		} else {
		  // This source does not fit the restriction.
		  _sourceStorage[s].minmax.selected = false;
		}
	      }
	    }
	  };
	  rObj.restrictSelection_minmax = _restrictSelection_minmax;

	  // Method to reset the selection of sources based on minmax objects.
	  var _resetSelection_minmax = function() {
	    for (var s in _sourceStorage) {
	      if (_sourceStorage.hasOwnProperty(s)) {
		_sourceStorage[s].minmax.selected = true;
	      }
	    }
	  };
	  rObj.resetSelection_minmax = _resetSelection_minmax;

	  // Method to determine how many sources are selected based on the minmax
	  // objects.
	  var _countSelection_minmax = function() {
	    var n = 0;
	    for (var s in _sourceStorage) {
	      if (_sourceStorage.hasOwnProperty(s) &&
		  _sourceStorage[s].minmax.selected === true) {
		n++;
	      }
	    }

	    return n;
	  };
	  rObj.countSelection_minmax = _countSelection_minmax;

	  // Get the list of selected sources in the requested order.
	  var _getSourceList_minmax = function() {
	    var sl = [];
	    // Check for the cached version.
	    if (typeof(_sourceLists[_sortMethod]) !== 'undefined') {
	      for (var i = 0; i < _sourceLists[_sortMethod].length; i++) {
		if (_sourceStorage[_sourceLists[_sortMethod][i]].minmax.selected === true) {
		  sl.push(_sourceLists[_sortMethod][i]);
		}
	      }
	    }
	    return sl;
	  };
	  rObj.getSourceList_minmax = _getSourceList_minmax;
	  
	   // Return our object.
	   return rObj;
	   
	 });
