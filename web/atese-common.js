define( [ "dojo/request/xhr", "astrojs/skyCoordinate" ],
	 function(xhr, skyCoord) {

	   // The object we return to our caller.
	   var rObj = {};

	   // Some private variables that we use throughout.
	   var _sortMethod = "ra"; // By default, we ask for the sources in R.A. order.
	   
	   var _inFlight = false; // Set to true when a Node.js query is made.
	   // The storage.
	   var _sourceStorage = {};
	   var _sourceLists = {};

	   // Storage for our page clients to keep state.
	   var _clientStorage = {};
	   
	   // Our private methods.

	   // The routine that handles communications with the Node.js server.
	   var _comms_node = function(q) {
	     var hostName = window.location.hostname;
	     var protocol = window.location.protocol;
	     _inFlight = true;
	     var p = xhr(protocol + "//" + hostName + ":8001/datarelease/", {
	       'handleAs': "json",
	       'query': q
	     });

	     return p;
	   };

	   // Method to get the entire list of sources in the sort order that
	   // we've requested, and cache it.
	   var _get_source_list = function() {
	     return _comms_node({ 'type': "sourceList" }).then(function(data) {
	       if (typeof(data) !== 'undefined' &&
		   typeof(data.sourceList) !== 'undefined') {
		 _sourceLists[_sortMethod] = data.sourceList;
	       }
	       return data;
	     });
	   };
	   
	   // Method to go through a list of sources coming from the Node.js server
	   // and do some useful things.
	   var _parseSources = function(data) {
	     if (typeof(data) !== 'undefined' &&
		 typeof(data.data) !== 'undefined') {
	       for (var s in data.data) {
		 if (data.data.hasOwnProperty(s)) {
		   _sourceStorage[s] = data.data[s];
		   // Turn the right ascension and declination into a SkyCoord.
		   var l = data.data[s].rightAscension.length - 1;
		   var sc = skyCoord.new([
		     data.data[s].rightAscension[l], data.data[s].declination[l]
		   ]);
		   _sourceStorage[s].coordinate = sc;
		   // Compute the absolute value of the closure phase.
		   _sourceStorage[s].absClosurePhase =
		     data.data[s].closurePhase.map(Math.abs);
		   // An indicator of whether calculations are up to date.
		   _sourceStorage[s].upToDate = false;
		 }
	       }
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

	     if (nsrc > 0) {
	       cobj.nsources = nsrc;
	     } else {
	       // By default we ask for 100 sources.
	       cobj.nsources = 100;
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
	   var _getFirstSources = function() {
	     // Use our general method to do this.
	     return _getSources(null, 0, false);
	   };
	   rObj.getFirstSources = _getFirstSources;
	   
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
		 'avgFluxDensity': _sourceStorage[src].avgFluxDensity
	       };
	     } else {
	       return undefined;
	     }
	   };
	   rObj.getFluxDensityInformation = _getFluxDensityInformation;

	   // Compute all the flux densities and spectral indices for a particular
	   // source at some frequency.
	   var _computeSource = function(src, frequency, lowFlat, highFlat) {
	     if (_sourceStorage.hasOwnProperty(src)) {
	       // Check if we need to do anything.
	       if (!_sourceStorage[src].upToDate) {

		 // Calculate the flux densities and spectral indices.
		 _sourceStorage[src].computedFluxDensity =
		   _sourceStorage[src].fluxDensityFit.map(_fluxDensityAtFrequency(frequency));
		 _sourceStorage[src].computedSpectralIndex =
		   _sourceStorage[src].fluxDensityFit.map(_spectralIndexAtFrequency(frequency));

		 // Classify the spectral indices.
		 _sourceStorage[src].siClassification =
		   _sourceStorage[src].computedSpectralIndex.map(_classifySpectralIndex(lowFlat, highFlat));

		 // Compute the average and maximum flux densities.
		 _sourceStorage[src].maxFluxDensity =
		   Math.max.apply(this, _sourceStorage[src].computedFluxDensity);
		 _sourceStorage[src].avgFluxDensity =
 		   _arrayAverage(_sourceStorage[src].computedFluxDensity);
		 
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
		 'rightAscension': _sourceStorage[src].rightAscension[n]
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
	   var _getEpochSpectrum = function(src, n, col) {
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
		 var efname = epoch + "/" + src + "_" + epoch + ".json";

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
	   
	   // Return our object.
	   return rObj;
	   
	 });