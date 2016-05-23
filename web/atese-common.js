define( [ "dojo/request/xhr", "astrojs/skyCoordinate", "astrojs/base", "astrojs/coordinate",
	  "astrojs/time" ],
	 function(xhr, skyCoord, astrojs, coord, astroTime) {

	   // The object we return to our caller.
	   var rObj = {};

	   // Some private variables that we use throughout.
	   var _sortMethod = "ra"; // By default, we ask for the sources in R.A. order.
	   var _defaultNumSources = 100; // The number of sources to get from the server at once.
	   var _lastFrequency, _lastSpectralIndexLowFlat, _lastSpectralIndexHighFlat;
	   
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
	     var p = xhr(protocol + "//" + hostName + ":8080/datarelease/", {
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

	   
	   // Method to go through a list of sources coming from the Node.js server
	   // and do some useful things.
	   var _parseSources = function(data) {
	     if (typeof(data) !== 'undefined' &&
		 typeof(data.data) !== 'undefined') {
	       for (var s in data.data) {
		 if (data.data.hasOwnProperty(s) &&
		     !_sourceStorage.hasOwnProperty(s)) {
		   _sourceStorage[s] = data.data[s];
		   // Turn the right ascension and declination into a SkyCoord.
		   var l = data.data[s].rightAscension.length - 1;
		   var sc = skyCoord.new({
		       'ra': {
			   'value': astrojs.hexa2turns(data.data[s].rightAscension[l], {
			       'units': "hours"
			   }),
			   'units': "turns"
		       },
		       'dec': data.data[s].declination[l],
		       'frame': "J2000"
		       });
		   _sourceStorage[s].coordinate = sc;
		   // Compute the absolute value of the closure phase.
		   _sourceStorage[s].absClosurePhase =
		     data.data[s].closurePhase.map(Math.abs);
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

	   // Our public methods.

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
	     
	     // We support either time or R.A. sorting.
	     if (v === 'ra' || v === 'time') {
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

	   // Return our object.
	   return rObj;
	   
	 });
