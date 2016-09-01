require( [ "./atese-common.js", "dojo/dom", "dojo/dom-construct", "dojo/when",
	   "dojo/on", "dojo/_base/lang", "dojo/dom-attr", "dojo/dom-class", "dojo/number",
	   "atnf/base" ],
	 function(atese, dom, domConstruct, when, on, lang, domAttr, domClass, number, atnf) {

	   var resStor = {};
	   var evaluationRoutines = {};
	   var evaluationOptions = { 'compute': true };
	   
	   var plotHistogram = function(xvals, domNode, layoutOptions) {
	     var pd = [ { 'x': xvals, 'type': 'histogram' } ];

	     var defltLayout = { 'xaxis': { 'type': 'linear', 'autorange': true, 'showline': true, 'mirror': true,
					    'title': "Please specify title" },
				 'yaxis': { 'type': 'log', 'autorange': true, 'showline': true, 'mirror': true,
					    'title': "Please specify title" } };

	     // Mix in defaults with the specified options.
	     atese.mixin(defltLayout, layoutOptions);
	     domConstruct.empty(domNode);
	     Plotly.newPlot(domNode, pd, defltLayout);
	   };

	   var plot2DHistogram = function(xvals, yvals, domNode, layoutOptions) {
	     var pd = [ { 'x': xvals, 'y': yvals, 'type': 'histogram2d' } ];

	     var defltLayout = { 'xaxis': { 'type': 'linear', 'autorange': true, 'showline': true, 'mirror': true,
					    'title': "Please specify title" },
				 'yaxis': { 'type': 'log', 'autorange': true, 'showline': true, 'mirror': true,
					    'title': "Please specify title" } };

	     // Mix in defaults with the specified options.
	     atese.mixin(defltLayout, layoutOptions);
	     
	     Plotly.newPlot(domNode, pd, defltLayout);
	   };

	   var storeResult = function(name, values) {
	     resStor[name] = values;
	   };

	   var fetchResult = function(name) {
	     if (resStor.hasOwnProperty(name)) {
	       return resStor[name];
	     } else {
	       return null;
	     }
	   };
	   
	   var firstComputation = true;
	   
	   var necessaryComputations = function() {
	     // We collect all the computations that are required for our plots
	     // and later for the source selections.

	     // Number of sources selected.
	     var numSources = atese.countSelection_minmax();
	     storeResult("numSelectedSources", numSources);
	     if (firstComputation) {
	       storeResult("numAllSources", numSources);
	     }

	     var srcList = atese.getSourceList_minmax();
	     var epochs = atese.valueAllSources([ 'epochs' ], {
	       'minmaxSelection': true, 'flatten': false
	     }).map(function(a, i) {
	       return a.map(function(b) {
		 return (srcList[i] + " " + b);
	       });
	     });
	     var fepochs = [].concat.apply([], epochs);
	     storeResult("allMeasurements", fepochs);
	     
	     // Flux densities.
	     // The flux densities close to 5.5 GHz.
	     var ffds = atese.valueAllSources([ 'fluxDensityFit', 'closest5.5', 1 ], {
	       'minmaxSelection': true
	     }).map(Math.log10);
	     storeResult("logFluxDensitiesNear5.5", ffds);
	     storeResult("minmax_logFluxDensitiesNear5.5", atese.calculate_minmax(ffds));
	     if (firstComputation) {
	       storeResult("numAllMeasurements", ffds.length);
	     }

	     // The flux densities evaluated at 5.5 GHz.
	     var fms = atese.valueAllSources([ 'fluxDensityFit', 'fitCoefficients' ], {
	       'flatten': false, 'minmaxSelection': true
	     }).map(function(a) {
	       return a.map(function(b) {
		 return Math.log10(atese.fluxModel2Density(b, 5500));
	       });
	     });
	     storeResult("logAllFluxDensitiesAt5.5", fms);
	     if (firstComputation) {
	       atese.store_minmax(fms, 'at5.5');
	     }
	     var ffms = [].concat.apply([], fms);
	     storeResult("logFluxDensitiesAt5.5", ffms);
	     storeResult("minmax_logFluxDensitiesAt5.5", atese.calculate_minmax(ffms));

	     // Defects.
	     var fdefects = atese.valueAllSources([ 'defect' ], {
	       'minmaxSelection': true
	     }).map(Math.log10);
	     storeResult("logDefects", fdefects);
	     storeResult("minmax_logDefects", atese.calculate_minmax(fdefects));

	     // Closure Phases.
	     var fclosurePhases = atese.valueAllSources([ 'closurePhase' ], {
	       'minmaxSelection': true
	     });
	     storeResult("closurePhases", fclosurePhases);
	     storeResult("minmax_closurePhases", atese.calculate_minmax(fclosurePhases.filter(atese.scrubArray(-999))));

	     // Fit scatters.
	     var fscatters = atese.valueAllSources([ 'fluxDensityFit', 'fitScatter' ], {
	       'minmaxSelection': true
	     }).map(Math.log10);
	     storeResult("logFitScatters", fscatters);
	     storeResult("minmax_logFitScatters", atese.calculate_minmax(fscatters));

	     // Number of measurements.
	     var nmeas = atese.valueAllSources([ 'epochs' ], {
	       'flatten': false, 'minmaxSelection': true
	     }).map(function(a) {
	       return a.map(function(b) {
		 return Math.log10(a.length);
	       });
	     });
	     storeResult("logAllNumMeasurements", nmeas);
	     var fnmeas = [].concat.apply([], nmeas);
	     storeResult("logNumMeasurements", fnmeas);
	     storeResult("minmax_logNumMeasurements", atese.calculate_minmax(fnmeas));

	     // Alphas.
	     var alphas = [];
	     for (var i = 0; i < 4; i++) {
	       var a = atese.valueAllSources([ 'fluxDensityFit', 'alphas5.5', i ], {
		 'minmaxSelection': true
	       });
	       if (i == 0) {
		 var b = a.map(Math.log10);
		 a = b;
	       }
	       alphas.push(a);
	     }
	     storeResult("alphas5.5", alphas);

	     // Solar angles.
	     var solarAngles = atese.valueAllSources([ 'solarAngles' ], {
	       'minmaxSelection': true
	     });
	     storeResult("solarAngles", solarAngles);
	     storeResult("minmax_solarAngles", atese.calculate_minmax(solarAngles));
	     
	     // Modulation indices.
	     // We need the flux densities near 5.5 GHz, per source.
	     var fds = atese.valueAllSources([ 'fluxDensityFit', 'closest5.5', 1 ], {
	       'flatten': false, 'minmaxSelection': true
	     });
	     // Compute the mean flux density for each source.
	     var meanfds = fds.map(function(a) {
	       return (a.reduce(function(p, c) { return (p + c); }, 0) / (a.length || 1));
	     });
	     var logmfds = meanfds.map(Math.log10);
	     storeResult("logMeanFluxDensities", logmfds);
	     // Now compute the difference from the mean, squared.
	     var modulationIndices = fds.map(function(a, i) {
	       var mi = Math.sqrt(a.reduce(function(p, c) {
		 return (p + Math.pow((c - meanfds[i]), 2));
	       }, 0)) / (meanfds[i]);
	       if (mi === 0) {
		 mi = 0.001;
	       }
	       return (Math.log10(mi));
	     });
	     storeResult("logSourceModulationIndices", modulationIndices);
	     storeResult("minmax_logModulationIndices", atese.calculate_minmax(modulationIndices));
	     // Store the same result for each of the measurements.
	     var allModulationIndices = fds.map(function(a, i) {
	       return a.map(function(b) {
		 return modulationIndices[i];
	       });
	     });
	     var fallModulationIndices = [].concat.apply([], allModulationIndices);
	     storeResult("logModulationIndices", fallModulationIndices);
	     if (firstComputation) {
	       atese.store_minmax(allModulationIndices, 'modIndex');
	     }
	     
	     firstComputation = false;

	   };

	   var measurementFilterFunction = function(range) {
	     return function(a) {
	       return ((a >= range[0]) && (a <= range[1]));
	     };
	   };

	   var filterFromArray = function(arr) {
	     return function(a, i) {
	       return arr[i];
	     };
	   };
	   
	   var measurementFilter = function() {
	     // We take each of the stored arrays, and filter them to remove the
	     // measurements that don't match the ranges we're allowing.
	     // Flux densities close to 5.5 GHz.
	     var ffds = fetchResult("logFluxDensitiesNear5.5");
	     //var fss = fetchResult("logFluxDensitiesNear5.5Sources");
	     var fdsRange = getSliderValues("vis-fd-near55");
	     var filter_ffds = ffds.map(measurementFilterFunction(fdsRange));

	     // Flux densities at 5.5 GHz.
	     var fms = fetchResult("logFluxDensitiesAt5.5");
	     var fmsRange = getSliderValues("vis-fd-eval55");
	     var filter_fms = fms.map(measurementFilterFunction(fmsRange));

	     // Defects.
	     var def = fetchResult("logDefects");
	     var defRange = getSliderValues("vis-defect");
	     var filter_def = def.map(measurementFilterFunction(defRange));

	     // Closure phases.
	     var clp = fetchResult("closurePhases");
	     var clpRange = getSliderValues("vis-closurephase");
	     var filter_clp = clp.map(measurementFilterFunction(clpRange));
	     
	     // Fit scatters.
	     var fts = fetchResult("logFitScatters");
	     var ftsRange = getSliderValues("vis-fitrms");
	     var filter_fts = fts.map(measurementFilterFunction(ftsRange));
	     
	     // Number of measurements.
	     var num = fetchResult("logNumMeasurements");
	     var numRange = getSliderValues("vis-nmeasurements");
	     var filter_num = num.map(measurementFilterFunction(numRange));
	     
	     // Alphas.
	     var alp = fetchResult("alphas5.5");

	     // Solar angles.
	     var sol = fetchResult("solarAngles");
	     var solRange = getSliderValues("vis-solarangles");
	     var filter_sol = sol.map(measurementFilterFunction(solRange));

	     // Modulation Indices.
	     var mod = fetchResult("logModulationIndices");
	     var modRange = getSliderValues("vis-modindex");
	     var filter_mod = mod.map(measurementFilterFunction(modRange));

	     // The measurement names.
	     var nam = fetchResult("allMeasurements");
	     
	     // Now make a master filter array.
	     var filterArray = [];
	     var revFilterArray = [];
	     var reasonArray = [];
	     for (var i = 0; i < filter_ffds.length; i++) {
	       filterArray[i] = filter_ffds[i] && filter_fms[i] && filter_def[i] &&
		 filter_clp[i] && filter_fts[i] && filter_num[i] && filter_sol[i] &&
		 filter_mod[i];
	       revFilterArray[i] = !filterArray[i];
	       if (revFilterArray[i]) {
		 if (!filter_ffds[i]) {
		   reasonArray[i] = "flux density";
		 } else if (!filter_fms[i]) {
		   reasonArray[i] = "model eval";
		 } else if (!filter_def[i]) {
		   reasonArray[i] = "defect";
		 } else if (!filter_clp[i]) {
		   reasonArray[i] = "closure phase";
		 } else if (!filter_fts[i]) {
		   reasonArray[i] = "fit scatter";
		 } else if (!filter_num[i]) {
		   reasonArray[i] = "number measurements";
		 } else if (!filter_sol[i]) {
		   reasonArray[i] = "solar angle";
		 } else if (!filter_mod[i]) {
		   reasonArray[i] = "modulation index";
		 }
	       }
	     }
	     
	     // And filter the arrays.
	     var arrFilter = filterFromArray(filterArray);
	     var arrRevFilter = filterFromArray(revFilterArray);
	     var filtered_ffds = ffds.filter(arrFilter);
	     storeResult("logFluxDensitiesNear5.5", filtered_ffds);
	     var filtered_fms = fms.filter(arrFilter);
	     storeResult("logFluxDensitiesAt5.5", filtered_fms);
	     var filtered_def = def.filter(arrFilter);
	     storeResult("logDefects", filtered_def);
	     var filtered_clp = clp.filter(arrFilter);
	     storeResult("closurePhases", filtered_clp);
	     var filtered_fts = fts.filter(arrFilter);
	     storeResult("logFitScatters", filtered_fts);
	     var filtered_num = num.filter(arrFilter);
	     storeResult("logNumMeasurements", filtered_num);
	     var filtered_alp = alp.map(function(a) {
	       return a.filter(arrFilter);
	     });
	     storeResult("alphas5.5", filtered_alp);
	     var filtered_sol = sol.filter(arrFilter);
	     storeResult("solarAngles", filtered_sol);
	     var filtered_mod = mod.filter(arrFilter);
	     storeResult("logModulationIndices", filtered_mod);
	     var filtered_nam = nam.filter(arrRevFilter);
	     var filtered_reasons = reasonArray.filter(arrRevFilter);
	     storeResult("allMeasurements", filtered_nam);
	     storeResult("allReasons", filtered_reasons);
	   };
	   
	   var fdsHistogram = function(domNode) {
	     // This makes a histogram of the flux densities measured as close to 5.5 GHz
	     // as possible.
	     var fds = fetchResult("logFluxDensitiesNear5.5");
	     var pctSelectedMeasurements = number.round((fds.length / fetchResult("numAllMeasurements")) * 100, 1);
	     domAttr.set('nmeasurements-shown', "innerHTML", fds.length + " (" +
			 pctSelectedMeasurements + "%)");
	     
	     plotHistogram(fds, domNode, { 'xaxis': { 'title': "log(Measured flux density near 5.5 GHz [Jy])" },
					   'yaxis': { 'title': "Number of measurements" } });
	   };

	   var fmsHistogram = function(domNode) {
	     // This computes and makes a histogram of the flux models evaluated at 5.5 GHz.
	     var fds = fetchResult("logFluxDensitiesAt5.5");
	     var nfds = parseInt(domAttr.get('nmeasurements-shown', "innerHTML"));
	     if (nfds !== fds.length) {
	       domClass.add('nmeasurements-shown', 'error');
	     } else {
	       domClass.remove('nmeasurements-shown', 'error');
	     }
	     
	     plotHistogram(fds, domNode, { 'xaxis': { 'title': "log(Evaluated flux density at 5.5 GHz [Jy])" },
					   'yaxis': { 'title': "Number of measurements" } });
	   };

	   var defectHistogram = function(domNode) {
	     // This makes a histogram of all the defects.
	     var defs = fetchResult("logDefects");
	     
	     plotHistogram(defs, domNode, { 'xaxis': { 'title': "log(Defect [%])" },
					    'yaxis': { 'title': "Number of measurements" } });
	   };

	   var closurePhaseHistogram = function(domNode) {
	     // This makes a histogram of all the closure phases.
	     var clophas = fetchResult("closurePhases").filter(atese.scrubArray(-999));;
	     
	     plotHistogram(clophas, domNode, { 'xaxis': { 'title': "Closure phase [deg]" },
					       'yaxis': { 'title': "Number of measurements" } });
	   };

	   var fitrmsHistogram = function(domNode) {
	     // This makes a histogram of all the RMS fit scatters.
	     var scatters = fetchResult("logFitScatters");
	     plotHistogram(scatters, domNode, { 'xaxis': { 'title': "log(Fit Scatter RMS [Jy])" },
						'yaxis': { 'title': "Number of measurements" } });
	   };

	   var nmeasHistogram = function(domNode) {
	     // This makes a histogram of the number of measurements per source.
	     var nmeas = fetchResult("logAllNumMeasurements").map(function(a) {
	       return a[0];
	     });
	     plotHistogram(nmeas, domNode, { 'xaxis': { 'title': "log(Number of measurements)" },
					     'yaxis': { 'title': "Number of sources" } });
	   };
	   
	   var alphasHistograms = function(domNodes) {
	     // This makes several histograms of the fit alphas.
	     var alphas = fetchResult("alphas5.5");
	     for (var i = 0; i < domNodes.length; i++) {
	       plotHistogram(alphas[i], domNodes[i], { 'xaxis': { 'title': "&alpha;<sub>" + i + "</sub>" },
						       'yaxis': { 'title': "Number of measurements" } });
	     }
	   };

	   var solarHistogram = function(domNode) {
	     var soldist = fetchResult("solarAngles");
	     plotHistogram(soldist, domNode, { 'xaxis': { 'title': "Solar distance [deg]" },
					       'yaxis': { 'title': "Number of measurements" } });

	   };

	   var solarDefectHistogram = function(domNode) {
	     var soldist = fetchResult("solarAngles");
	     var defs = fetchResult("logDefects");

	     plot2DHistogram(defs, soldist, domNode, {
	       'xaxis': { 'title': "log(Defect [%])" },
	       'yaxis': { 'title': "Solar distance [deg]", 'type': 'linear' } });
	     
	   };

	   var closurephaseDefectHistogram = function(domNode) {
	     var clophas = fetchResult("closurePhases");
	     var defs = fetchResult("logDefects");

	     plot2DHistogram(defs, clophas, domNode, {
	       'xaxis': { 'title': "log(Defect [%])" },
	       'yaxis': { 'title': "Closure phase [deg]", 'type': 'linear' } });
	   };

	   var modindexHistogram = function(domNode) {
	     // Calculate the modulation index for each source and histogram them.
	     var modindices = fetchResult("logSourceModulationIndices");
	     plotHistogram(modindices, domNode, { 'xaxis': { 'title': "log(Modulation index)" },
						  'yaxis': { 'title': "Number of sources" } });
	   };

	   var defectModindexHistogram = function(domNode) {
	     var defs = fetchResult("logDefects");
	     var modindices = fetchResult("logModulationIndices");

	     plot2DHistogram(defs, modindices, domNode, {
	       'xaxis': { 'title': "log(Defect [%])" },
	       'yaxis': { 'title': "log(Modulation index)", 'type': 'linear' } });
	   };

	   var closurephaseModindexHistogram = function(domNode) {
	     var clophas = fetchResult("closurePhases");
	     var modindices = fetchResult("logModulationIndices");
	     
	     plot2DHistogram(clophas, modindices, domNode, {
	       'histnorm': 'percent',
	       'xaxis': { 'title': "Closure Phase [deg]", 'type': 'linear' },
	       'yaxis': { 'title': "log(Modulation index)", 'type': 'linear' } });
	   };

	   var getMarkerSizes = function() {
	     // Determine the marker sizes.
	     var sizeSelectorIdx = dom.byId('skyplot-marker-selector').selectedIndex;
	     var sizeSelector = dom.byId('skyplot-marker-selector').options[sizeSelectorIdx].value;
	     var markerSizes = 7; // A default should something fail.

	     if (sizeSelector === 'modindex') {
	       // Get the modulation indices.
	       var modindices = fetchResult("logSourceModulationIndices");
	       markerSizes = modindices.map(function(a) { return (14 + a * 10); });
	     } else if (sizeSelector === 'avgflux') {
	       var mfds = fetchResult("logMeanFluxDensities");
	       markerSizes = mfds.map(function(a) { return (14 + a * 10); });
	     } else if (sizeSelector === 'numobs') {
	       var nmeas = fetchResult("logAllNumMeasurements").map(function(a) {
		 return a[0];
	       });
	       markerSizes = nmeas.map(function(a) { return (Math.pow(10, a)); });
	     } else if (sizeSelector === 'constant') {
	       markerSizes = 7;
	     }

	     return markerSizes;
	   };

	   var equatorialToLonLat = function(c, m) {
	     // Take a sky coordinate and return Lon/Lat for J2000 equatorial.
	     if (c !== null && atnf.isSkyCoordinate(c)) {
	       var j = c.toJ2000();
	       if (m === 'degrees') {
		 return { 'lon': j.rightAscension.toDegrees() - 180,
			  'lat': j.declination.toDegrees() };
	       } else if (m === 'string') {
		 var ra = atnf.turns2hexa(j.rightAscension.toTurns(), { 'precision': 1, 'units': 'hours' });
		 var dec = atnf.turns2hexa(j.declination.toTurns(), { 'precision': 0 });
		 var rstring = "RA: " + ra + "<br />Dec: " + dec;
		 return rstring;
	       }
	     } else {
	       if (m === 'degrees') {
		 return { 'lon': 0, 'lat': 0 };
	       } else if (m === 'string') {
		 return ("RA: 000\nDec: 000");
	       }
	     }
	   };

	   var galacticToLonLat = function(c, m) {
	     // Take a sky coordinate and return Lon/Lat for Galactic.
	     if (c !== null && atnf.isSkyCoordinate(c)) {
	       var j = c.toGalactic();
	       if (m === 'degrees') {
		 return { 'lon': j.longitude.toDegrees(),
			  'lat': j.latitude.toDegrees() };
	       } else if (m === 'string') {
		 var lon = number.round(j.longitude.toDegrees(), 3);
		 var lat = number.round(j.latitude.toDegrees(), 3);
		 var rstring = "(l,b) = (" + lon + "," + lat + ")";
		 return rstring;
	       }
	     } else {
	       if (m === 'degrees') {
		 return { 'lon': 0, 'lat': 0 };
	       } else if (m === 'string') {
		 return "(l,b) = (000,000)";
	       }
	     }
	   };
	   
	   var selectedCoordinateSystem = function() {
	     var coordinateSelectorIdx = dom.byId('skyplot-coordinate-system').selectedIndex;
	     var coordinateSelector = dom.byId('skyplot-coordinate-system').
		 options[coordinateSelectorIdx].value;
	     return coordinateSelector;
	   };
	   
	   var markerCoordinates = function() {
	     // Return the coordinates of the sources in the selected coordinate
	     // system.
	     var coordinateSelector = selectedCoordinateSystem();
	     var sources = atese.getSourceList_minmax();
	     var mfunc = null;
	     if (coordinateSelector === "equatorial") {
	       mfunc = equatorialToLonLat;
	     } else if (coordinateSelector === "galactic") {
	       mfunc = galacticToLonLat;
	     }
	     var coords = sources.map(function(a) {
	       var c = atese.getSourceProperty(a, "coordinate");
	       if (c === null || !atnf.isSkyCoordinate(c)) {
		 console.log(a + " is broken");
	       }
	       return mfunc(c, "degrees");
	     });
	     var lon = coords.map(function(a) { return a.lon; });
	     var lat = coords.map(function(a) { return a.lat; });
	     return { 'lon': lon, 'lat': lat };
	   };

	   var markerHover = function() {
	     // Return a formatted text box for each source, dependent on the
	     // selected coordinate system.
	     var coordinateSelector = selectedCoordinateSystem();
	     var sources = atese.getSourceList_minmax();
	     var mfunc = null;
	     if (coordinateSelector === "equatorial") {
	       mfunc = equatorialToLonLat;
	     } else if (coordinateSelector === "galactic") {
	       mfunc = galacticToLonLat;
	     }
	     var text = sources.map(function(a) {
	       var c = atese.getSourceProperty(a, "coordinate");
	       var co = mfunc(c, "string");
	       return a + "<br />" + co;
	     });
	     return text;
	   };
	   
	   var skyPlot = function(domNode) {
	     // Get the RA and Dec.
	     var sources = atese.getSourceList_minmax();
	     var latLonData = markerCoordinates();
	     
	     var markerSizes = getMarkerSizes();
	     var markerText = markerHover();
	     var data = [ { 'type': 'scattergeo', 'mode': 'markers',
			    'text': markerText, 'lon': latLonData.lon, 'lat': latLonData.lat,
			    'marker': { 'size': markerSizes, 'line': { 'width': 1 } },
			    'name': 'C2914', 'hoverinfo': "text" } ];
	     var layout = {
	       'title': "Survey sources",
	       'geo': {
		 'projection': { 'type': 'hammer' },
		 'resolution': 1,
		 'lonaxis': {
		   'range': [ -180, 180 ],
		   'showgrid': true,
		   'tick0': 0, 'dtick': 15
		 },
		 'lataxis': {
		   'range': [ -90, 90 ],
		   'showgrid': true
		 },
		 'showrivers': false, 'showlakes': false, 'showland': false,
		 'showcoastlines': false
	       }
	     };
	     Plotly.newPlot(domNode, data, layout);
	   };

	   var genSliderId = function(id) {
	     return ('slider-' + id);
	   };
	   
	   var addSlider = function(pid, min, max) {
	     // Make a slider to allow for range selection.
	     var id = genSliderId(pid);
	     var sliderDiv = domConstruct.create('div', {
	       'id': id,
	       'class': 'slider-div'
	     }, dom.byId(pid), 'before');

	     // The label.
	     var labid = id + '-name-label';
	     domConstruct.create('div', {
	       'id': labid,
	       'class': 'slider-name-span'
	     }, sliderDiv);


	     // The slider.
	     var sliderid = id + '-slider';
	     var sliderSpan = domConstruct.create('div', {
	       'id': id,
	       'class': 'slider-slider'
	     }, sliderDiv);

	     // The values get rounded to 0.01 place.
	     min = number.round((min - 0.01), 2);
	     max = number.round((max + 0.01), 2);

	     noUiSlider.create(sliderSpan, {
	       'start': [ (min - 0.01), (max + 0.01) ],
	       'connect': true,
	       'orientation': 'horizontal',
	       'range': { 'min': min, 'max': max },
	       'pips': { 'mode': 'steps', 'density': 2 }
	     });

	     // The indicator boxes.
	     var textLowid = id + '-indicator-low';
	     var textLow = domConstruct.create('input', {
	       'id': textLowid,
	       'class': 'slider-input',
	       'value': min
	     }, sliderDiv);
	     var textHighid = id + '-indicator-high';
	     var textHigh = domConstruct.create('input', {
	       'id': textHighid,
	       'class': 'slider-input',
	       'value': max
	     }, sliderDiv);

	     // The function to update the boxes.
	     sliderSpan.noUiSlider.on('update', function(values) {
	       domAttr.set(textLow, 'value', values[0]);
	       domAttr.set(textHigh, 'value', values[1]);
	     });

	     // The function to update the sliders when the box values
	     // change.
	     on(textLow, 'change', function() {
	       var lval = parseFloat(domAttr.get(textLow, 'value'));
	       var hval = parseFloat(domAttr.get(textHigh, 'value'));
	       if (lval < min) {
		 lval = min;
	       }
	       if (lval > hval) {
		 lval = hval;
	       }
	       domAttr.set(textLow, 'value', lval);
	       sliderSpan.noUiSlider.set([ lval, hval ]);
	     });

	     on(textHigh, 'change', function() {
	       var lval = parseFloat(domAttr.get(textLow, 'value'));
	       var hval = parseFloat(domAttr.get(textHigh, 'value'));
	       if (hval > max) {
		 hval = max;
	       }
	       if (hval < lval) {
		 hval = lval;
	       }
	       domAttr.set(textHigh, 'value', hval);
	       sliderSpan.noUiSlider.set([ lval, hval ]);
	     });
	     
	     return labid;
	   };

	   var getSliderValues = function(pid) {
	     // We return the low and high values for the slider with the
	     // specified id.
	     var id = genSliderId(pid);
	     var lowid = id + '-indicator-low';
	     var highid = id + '-indicator-high';
	     if (dom.byId(lowid) && dom.byId(highid)) {
	       return [ parseFloat(domAttr.get(lowid, 'value')),
			parseFloat(domAttr.get(highid, 'value')) ];
	     }
	     return null;
	   };

	   var makeSliders = function() {
	     // This routine adds all the sliders that we want to the page.
	     var fdsMinMax = fetchResult('minmax_logFluxDensitiesNear5.5');
	     domAttr.set(addSlider('vis-fd-near55', fdsMinMax.min, fdsMinMax.max),
			 'innerHTML', "log(fd near 5.5GHz)");
	     
	     var fmsMinMax = fetchResult('minmax_logFluxDensitiesAt5.5');
	     domAttr.set(addSlider('vis-fd-eval55', fmsMinMax.min, fmsMinMax.max),
			 'innerHTML', "log(fd at 5.5GHz)");

	     var defMinMax = fetchResult('minmax_logDefects');
	     domAttr.set(addSlider('vis-defect', defMinMax.min, defMinMax.max),
			 'innerHTML', "log(defect [%])");

	     var clpMinMax = fetchResult('minmax_closurePhases');
	     domAttr.set(addSlider('vis-closurephase', clpMinMax.min, clpMinMax.max),
			 'innerHTML', "closure phase [deg]");

	     var ftsMinMax = fetchResult('minmax_logFitScatters');
	     domAttr.set(addSlider('vis-fitrms', ftsMinMax.min, ftsMinMax.max),
			 'innerHTML', "log(fit scatter [Jy])");

	     var numMinMax = fetchResult('minmax_logNumMeasurements');
	     domAttr.set(addSlider('vis-nmeasurements', numMinMax.min, numMinMax.max),
			 'innerHTML', "log(number measurements)");

	     var solMinMax = fetchResult('minmax_solarAngles');
	     domAttr.set(addSlider('vis-solarangles', solMinMax.min, solMinMax.max),
			 'innerHTML', "solar distance [deg]");

	     var modMinMax = fetchResult('minmax_logModulationIndices');
	     domAttr.set(addSlider('vis-modindex', modMinMax.min, modMinMax.max),
			 'innerHTML', "log(modulation index)");
	     
	     on(dom.byId('button-update'), 'click', function() {
	       // Get all the ranges.
	       var fdsRange = getSliderValues('vis-fd-near55');
	       var fmsRange = getSliderValues('vis-fd-eval55');
	       var defRange = getSliderValues('vis-defect');
	       var clpRange = getSliderValues('vis-closurephase');
	       var ftsRange = getSliderValues('vis-fitrms');
	       var numRange = getSliderValues('vis-nmeasurements');
	       var solRange = getSliderValues('vis-solarangles');
	       var modRange = getSliderValues('vis-modindex');
	       
	       // Reset the restrictions.
	       atese.resetSelection_minmax();

	       // Go through and make the selections.
	       atese.restrictSelection_minmax('closest5.5', fdsRange[0], fdsRange[1]);
	       atese.restrictSelection_minmax('at5.5', fmsRange[0], fmsRange[1]);
	       atese.restrictSelection_minmax('defect', Math.pow(10, defRange[0]), Math.pow(10, defRange[1]));
	       atese.restrictSelection_minmax('closurePhase', clpRange[0], clpRange[1]);
	       atese.restrictSelection_minmax('fitScatter', ftsRange[0], ftsRange[1]);
	       atese.restrictSelection_minmax('numMeasurements', numRange[0], numRange[1]);
	       atese.restrictSelection_minmax('solarAngles', solRange[0], solRange[1]);
	       atese.restrictSelection_minmax('modIndex', modRange[0], modRange[1]);
	       visualise();
	     });
	   };
	   
	   // The master visualisation routine.
	   var firstVisualise = true;
	   var visualise = function(data) {
	     console.log(data);
	     if (firstVisualise) {
	       atese.stripMeasurements(5.5);
	     }
	     
	     necessaryComputations();
	     if (firstVisualise) {
	       makeSliders();
	     }
	     measurementFilter();
	     if (firstVisualise) {
	       console.log("excluding measurements:");
	       var t = fetchResult("allMeasurements");
	       var u = fetchResult("allReasons");
	       var v = t.map(function(a, i) {
		 return (a + "(" + u[i] + ")");
	       });
	       console.log(v);
	     }
	     
	     var pctSelectedSources = number.round((fetchResult("numSelectedSources") /
						    fetchResult("numAllSources")) * 100, 1);
	     domAttr.set('nsources-selected', 'innerHTML', fetchResult("numSelectedSources") +
			" (" + pctSelectedSources + "%)");
	     
	     fdsHistogram(dom.byId('vis-fd-near55'));
	     fmsHistogram(dom.byId('vis-fd-eval55'));

	     defectHistogram(dom.byId('vis-defect'));
	     closurePhaseHistogram(dom.byId('vis-closurephase'));
	     fitrmsHistogram(dom.byId('vis-fitrms'));
	     nmeasHistogram(dom.byId('vis-nmeasurements'));
	     alphasHistograms([ 'vis-a0', 'vis-a1', 'vis-a2', 'vis-a3' ]);
	     solarHistogram(dom.byId('vis-solarangles'));
	     modindexHistogram(dom.byId('vis-modindex'));
	     solarDefectHistogram(dom.byId('vis-solar-v-defect'));
	     closurephaseDefectHistogram(dom.byId('vis-closurephase-v-defect'));
	     defectModindexHistogram(dom.byId('vis-modindex-v-defect'));
	     closurephaseModindexHistogram(dom.byId('vis-modindex-v-closurephase'));
	     skyPlot(dom.byId('vis-skypos'));

	     if (firstVisualise) {
	       // Enable the marker size changer.
	       on(dom.byId('skyplot-marker-selector'), 'change', function() {
		 var markerSizes = getMarkerSizes();
		 var graphDiv = dom.byId('vis-skypos');
		 var markerText = markerHover();
		 graphDiv.data[0].marker.size = markerSizes;
		 graphDiv.layout.geo.lonaxis.range = [];
		 graphDiv.layout.geo.lataxis.range = [];
		 graphDiv.data[0].text = markerText;
		 Plotly.redraw(graphDiv);
	       });
	       // And the coordinate mode changer.
	       on(dom.byId('skyplot-coordinate-system'), 'change', function() {
		 var latLonData = markerCoordinates();
		 var graphDiv = dom.byId('vis-skypos');
		 var markerText = markerHover();
		 graphDiv.data[0].lon = latLonData.lon;
		 graphDiv.data[0].lat = latLonData.lat;
		 graphDiv.data[0].text = markerText;
		 Plotly.redraw(graphDiv);
	       });
	     }

	     firstVisualise = false;

	   };
	     
	   // Grab the data, then do the visualisations.
	   atese.setSorting('random');
	   atese.getCatalogue().then(visualise); //.then(makeSliders);

	 });
