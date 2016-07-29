require( [ "./atese-common.js", "dojo/dom", "dojo/dom-construct", "dojo/when",
	   "dojo/on", "dojo/_base/lang", "dojo/dom-attr" ],
	 function(atese, dom, domConstruct, when, on, lang, domAttr) {

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

	   var minmax = function(arr) {
	     var arrd = arr.filter(function(a) { return isFinite(a) && !isNaN(a); });
	     var min = Math.min.apply(null, arrd);
	     var max = Math.max.apply(null, arrd);
	     return { 'min': min, 'max': max };
	   };

	   var necessaryComputations = function() {
	     // We collect all the computations that are required for our plots
	     // and later for the source selections.

	     // Flux densities.
	     // The flux densities close to 5.5 GHz.
	     var fds = atese.valueAllSources([ 'fluxDensityFit', 'closest5.5', 1 ], {
	       'flatten': false
	     }).map(function(a) { return a.map(Math.log10); });
	     storeResult("logAllFluxDensitiesNear5.5", fds);
	     var mmfds = fds.map(minmax);
	     storeResult("logAllMinMaxFluxDensitiesNear5.5", mmfds);
	     var ffds = [].concat.apply([], fds);
	     storeResult("logFluxDensitiesNear5.5", ffds);
	     storeResult("minmax_logFluxDensitiesNear5.5", minmax(ffds));

	     // The flux densities evaluated at 5.5 GHz.
	     var fms = atese.valueAllSources([ 'fluxDensityFit', 'fitCoefficients' ], {
	       'flatten': false
	     }).map(function(a) {
	       return a.map(function(b) {
		 return Math.log10(atese.fluxModel2Density(b, 5500));
	       });
	     });
	     storeResult("logAllFluxDensitiesAt5.5", fms);
	     var mmfms = fms.map(minmax);
	     storeResult("logAllMinMaxFluxDensitiesAt5.5", mmfms);
	     var ffms = [].concat.apply([], fms);
	     storeResult("logFluxDensitiesAt5.5", ffms);
	     storeResult("minmax_logFluxDensitiesAt5.5", minmax(ffms));

	     // Defects.
	     var defects = atese.valueAllSources([ 'defect' ], { 'flatten': false }).
		 map(function(a) { return a.map(Math.log10); });
	     storeResult("logAllDefects", defects);
	     var mmdefects = defects.map(minmax);
	     storeResult("logAllMinMaxDefects", mmdefects);
	     var fdefects = [].concat.apply([], defects);
	     storeResult("logDefects", fdefects);
	     storeResult("minmax_logDefects", minmax(fdefects));

	     // Closure Phases.
	     var closurePhases = atese.valueAllSources([ 'closurePhase' ], {
	       'flatten': false
	     }).map(function(a) { return a.filter(atese.scrubArray(-999)); });
	     storeResult("allClosurePhases", closurePhases);
	     var mmclosurePhases = closurePhases.map(minmax);
	     storeResult("allMinMaxClosurePhases", mmclosurePhases);
	     var fclosurePhases = [].concat.apply([], closurePhases);
	     storeResult("closurePhases", fclosurePhases);
	     storeResult("minmax_closurePhases", minmax(fclosurePhases));
	   };
	   
	   var fdsHistogram = function(domNode) {
	     // This makes a histogram of the flux densities measured as close to 5.5 GHz
	     // as possible.
	     var fds = fetchResult("logFluxDensitiesNear5.5");

	     plotHistogram(fds, domNode, { 'xaxis': { 'title': "log(Measured flux density near 5.5 GHz [Jy])" },
					   'yaxis': { 'title': "Number of measurements" } });
	   };

	   var fmsHistogram = function(domNode) {
	     // This computes and makes a histogram of the flux models evaluated at 5.5 GHz.
	     var fds = fetchResult("logFluxDensitiesAt5.5");

	     plotHistogram(fds, domNode, { 'xaxis': { 'title': "log(Evaluated flux density at 5.5 GHz [Jy])" },
					   'yaxis': { 'title': "Number of measurements" } });
	   };

	   var defectHistogram = function(domNode) {
	     // This makes a histogram of all the defects.
	     var defs = fetchResult("logDefects");
	     
	     plotHistogram(defs, domNode, { 'xaxis': { 'title': "log(Defect [%])" },
					    'yaxis': { 'title': "Number of measurements" } });
	   };

	   var getClosurePhases = function() {
	     var closurePhases = fetchResult("closurePhases");
	     if (closurePhases === null) {
	       closurePhases = atese.valueAllSources([ 'closurePhase' ], {
		 'evaluationRoutines': evaluationRoutines, 'evaluationOptions': evaluationOptions
	       }).filter(atese.scrubArray(-999));
	       storeResult("closurePhases", closurePhases);
	     }
	     return closurePhases;
	   };
	   
	   var closurePhaseHistogram = function(domNode) {
	     // This makes a histogram of all the closure phases.
	     var clophas = fetchResult("closurePhases");
	     
	     plotHistogram(clophas, domNode, { 'xaxis': { 'title': "Closure phase [deg]" },
					       'yaxis': { 'title': "Number of measurements" } });
	   };

	   var fitrmsHistogram = function(domNode) {
	     // This makes a histogram of all the RMS fit scatters.
	     var scatters = atese.valueAllSources([ 'fluxDensityFit', 'fitScatter' ], {
	       'log': true, 'evaluationRoutines': evaluationRoutines, 'evaluationOptions': evaluationOptions
	     });
	     storeResult("logFitScatters", scatters);
	     plotHistogram(scatters, domNode, { 'xaxis': { 'title': "log(Fit Scatter RMS [Jy])" },
						'yaxis': { 'title': "Number of measurements" } });
	   };

	   var getNumberMeasurements = function() {
	     var nmeas = fetchResult("logNumMeasurements");
	     if (nmeas === null) {
	       var meas = atese.valueAllSources([ 'epochs' ], {
		 'flatten': false, 'evaluationRoutines': evaluationRoutines, 'evaluationOptions': evaluationOptions
	       });
	       nmeas = meas.map(function(a) { return Math.log10(a.length); });
	       storeResult("logNumMeasurements", nmeas);
	     }
	     return nmeas;
	   }
	   
	   var nmeasHistogram = function(domNode) {
	     // This makes a histogram of the number of measurements per source.
	     var nmeas = getNumberMeasurements();
	     plotHistogram(nmeas, domNode, { 'xaxis': { 'title': "log(Number of measurements)" },
					     'yaxis': { 'title': "Number of sources" } });
	   };
	   
	   var alphasHistograms = function(domNodes) {
	     // This makes several histograms of the fit alphas.
	     for (var i = 0; i < domNodes.length; i++) {
	       var o = { 'evaluationRoutines': evaluationRoutines, 'evaluationOptions': evaluationOptions };
	       if (i === 0) {
		 o['log'] = true;
	       }
	       var alphas = atese.valueAllSources([ 'fluxDensityFit', 'alphas5.5', i ], o);
	       plotHistogram(alphas, domNodes[i], { 'xaxis': { 'title': "&alpha;<sub>" + i + "</sub>" },
						    'yaxis': { 'title': "Number of measurements" } });
	     }
	   };

	   var getSolarAngles = function() {
	     var solarAngles = fetchResult("solarAngles");
	     if (solarAngles === null) {
	       solarAngles = atese.valueAllSources([ 'solarAngles' ], {
		 'evaluationRoutines': evaluationRoutines, 'evaluationOptions': evaluationOptions
	       });
	       storeResult("solarAngles", solarAngles);
	     }
	     return solarAngles;
	   }
	   
	   var solarHistogram = function(domNode) {
	     var soldist = getSolarAngles();
	     plotHistogram(soldist, domNode, { 'xaxis': { 'title': "Solar distance [deg]" },
					       'yaxis': { 'title': "Number of measurements" } });

	   };

	   var solarDefectHistogram = function(domNode) {
	     var soldist = getSolarAngles();
	     var defs = fetchResult("logDefects");

	     plot2DHistogram(defs, soldist, domNode, {
	       'xaxis': { 'title': "log(Defect [%])" },
	       'yaxis': { 'title': "Solar distance [deg]", 'type': 'linear' } });
	     
	   };

	   var closurephaseDefectHistogram = function(domNode) {
	     var clophas = getClosurePhases();
	     var defs = fetchResult("logDefects");

	     plot2DHistogram(defs, clophas, domNode, {
	       'xaxis': { 'title': "log(Defect [%])" },
	       'yaxis': { 'title': "Closure phase [deg]", 'type': 'linear' } });
	   };

	   var getModulationIndices = function() {
	     var modulationIndices = fetchResult("logModulationIndices");
	     if (modulationIndices === null) {
	       // We need the flux densities near 5.5 GHz, per source.
	       var fds = atese.valueAllSources([ 'fluxDensityFit', 'closest5.5', 1 ], {
		 'flatten': false, 'evaluationRoutines': evaluationRoutines, 'evaluationOptions': evaluationOptions
	       });
	       // Compute the mean flux density for each source.
	       var meanfds = fds.map(function(a) {
		 return (a.reduce(function(p, c) { return (p + c); }, 0) / (a.length || 1));
	       });
	       var logmfds = meanfds.map(function(a) { return Math.log10(a); });
	       storeResult("logMeanFluxDensities", logmfds);
	       // Now compute the difference from the mean, squared.
	       modulationIndices = fds.map(function(a, i) {
		 return (Math.log10(Math.sqrt(a.reduce(function(p, c) {
		   return (p + Math.pow((c - meanfds[i]), 2)); }, 0)) / (meanfds[i])));
	       });
	       storeResult("logModulationIndices", modulationIndices);
	     }
	     return modulationIndices;
	   };
	   
	   var modindexHistogram = function(domNode) {
	     // Calculate the modulation index for each source and histogram them.
	     var modindices = getModulationIndices();
	     plotHistogram(modindices, domNode, { 'xaxis': { 'title': "log(Modulation index)" },
						  'yaxis': { 'title': "Number of sources" } });
	   };

	   var defectModindexHistogram = function(domNode) {
	     var defs = fetchResult("logDefects");
	     var modindices = getModulationIndices();

	     plot2DHistogram(defs, modindices, domNode, {
	       'xaxis': { 'title': "log(Defect [%])" },
	       'yaxis': { 'title': "log(Modulation index)", 'type': 'linear' } });
	   };

	   var closurephaseModindexHistogram = function(domNode) {
	     var clophas = getClosurePhases();
	     var modindices = getModulationIndices();
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
	       var modindices = getModulationIndices();
	       markerSizes = modindices.map(function(a) { return (14 + a * 10); });
	     } else if (sizeSelector === 'avgflux') {
	       getModulationIndices();
	       var mfds = fetchResult("logMeanFluxDensities");
	       markerSizes = mfds.map(function(a) { return (14 + a * 10); });
	     } else if (sizeSelector === 'numobs') {
	       var nmeas = getNumberMeasurements();
	       markerSizes = nmeas.map(function(a) { return (Math.pow(10, a)); });
	     } else if (sizeSelector === 'constant') {
	       markerSizes = 7;
	     }

	     return markerSizes;
	   };
	   
	   var skyPlot = function(domNode) {
	     // Get the RA and Dec.
	     var sources = atese.getSourceList();
	     var coords = sources.map(function(a) {
	       var c = atese.getSourceProperty(a, "coordinate");
	       var j = c.toJ2000();
	       return [ j.rightAscension.toDegrees() - 180,
			j.declination.toDegrees() ];
	     });
	     var lon = coords.map(function(a) { return a[0] });
	     var lat = coords.map(function(a) { return a[1] });

	     var markerSizes = getMarkerSizes();
	     var data = [ { 'type': 'scattergeo', 'mode': 'markers',
			    'text': sources, 'lon': lon, 'lat': lat,
			    'marker': { 'size': markerSizes, 'line': { 'width': 1 } },
			    'name': 'C2914' } ];
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

	   var addSlider = function(id, min, max) {
	     // Make a slider to allow for range selection.
	     var sliderDiv = domConstruct.create('div', {
	       'id': id,
	       'class': 'slider-div'
	     }, dom.byId('update-button'), 'before');

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
	     noUiSlider.create(sliderSpan, {
	       'start': [ min, max ],
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

	   var getSliderValues = function(id) {
	     // We return the low and high values for the slider with the
	     // specified id.
	     var lowid = id + '-indicator-low';
	     var highid = id + '-indicator-high';
	     if (dom.byId(lowid) && dom.byId(highid)) {
	       return [ parseFloat(domAttr.get(lowid, 'value')),
			parseFloat(domAttr.get(highid, 'value')) ];
	     }
	     return null;
	   };

	   var evaluationRoutineGenerator = {
	     // Number of epochs.
	     'numEpochs': function(l, h, invert) {
	       return function(srcData) {
		 var rv = false;
		 if ((srcData.epochs.length >= l) &&
		     (srcData.epochs.length <= h)) {
		   rv = true;
		 }
		 if (invert) {
		   return !rv;
		 }
		 return rv;
	       };
	     },
	     'defect': function(l, h, invert) {
	       return function(srcData) {
		 var rv = false;
		 for (var i = 0; i < srcData.defect.length; i++) {
		   if ((srcData.defect[i] <= l) &&
		       (srcData.defect[i] >= h)) {
		     rv = true;
		     break;
		   }
		 }
		 if (invert) {
		   return !rv;
		 }
		 return rv;
	       };
	     },
	     'closurePhase': function(l, h, invert) {
	       return function(srcData) {
		 var rv = false;
		 for (var i = 0; i < srcData.closurePhase.length; i++) {
		   if ((Math.abs(srcData.closurePhase[i]) <= l) &&
		       (Math.abs(srcData.closurePhase[i]) >= h)) {
		     rv = true;
		     break;
		   }
		 }
		 if (invert) {
		   return !rv;
		 }
		 return rv;
	       };
	     },
	     'fluxDensityEval': function(l, h, invert) {
	       return function(srcData) {
		 var rv = false;
		 if (typeof srcData.computedFluxDensity !== "undefined") {
		   for (var i = 0; i < srcData.computedFluxDensity.length; i++) {
		     if ((srcData.computedFluxDensity[i] >= l) &&
			 (srcData.computedFluxDensity[i] <= h)) {
		       rv = true;
		     }
		   }
		 }
		 if (invert) {
		   return !rv;
		 }
		 return rv;
	       };
	     }
	   };
	   
	   var makeSliders = function() {
	     // This routine adds all the sliders that we want to the page.
	     var fdsMinMax = fetchResult('minmax_logFluxDensitiesNear5.5');
	     domAttr.set(addSlider('fds-slider', fdsMinMax.min, fdsMinMax.max),
			 'innerHTML', "log(fd near 5.5GHz)");
	     
	     var fmsMinMax = fetchResult('minmax_logFluxDensitiesAt5.5');
	     domAttr.set(addSlider('fms-slider', fmsMinMax.min, fmsMinMax.max),
			 'innerHTML', "log(fd at 5.5GHz)");
	     
	     
	     on(dom.byId('button-update'), 'click', function() {
	       // Get all the ranges.
	       var fdsRange = getSliderValues('fds-slider');
	       var fmsRange = getSliderValues('fms-slider');

	       // Clear out our data storage.
	       resStor = {};

	       // Select sources based on ranges.
	       evaluationRoutines = {};
	       evaluationRoutines.fluxDensityEval =
		 evaluationRoutineGenerator['fluxDensityEval'](Math.pow(10, fmsRange[0]),
							       Math.pow(10, fmsRange[1]), false);
	       visualise();
	     });
	   };
	   
	   // The master visualisation routine.
	   var visualise = function(data) {
	     console.log(data);

	     necessaryComputations();

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

	     // Enable the marker size changer.
	     on(dom.byId('skyplot-marker-selector'), 'change', function() {
	       var markerSizes = getMarkerSizes();
	       var graphDiv = dom.byId('vis-skypos');
	       console.log(graphDiv.data);
	       console.log(graphDiv.layout);
	       graphDiv.data[0].marker.size = markerSizes;
	       graphDiv.layout.geo.lonaxis.range = [];
	       graphDiv.layout.geo.lataxis.range = [];
	       Plotly.redraw(graphDiv);
	     });

	     //dom.byId('vis-skypos').on('plotly_unhover', function(e, d) { console.log(e); console.log(d); });
	     
	     //on(dom.byId('vis-skypos'), 'wheel', function(eventdata) {
	     //  console.log(eventdata);
	     //});	   };
	   };
	     
	   // Grab the data, then do the visualisations.
	   atese.setSorting('random');
	   atese.getCatalogue().then(visualise).then(makeSliders);

	 });
