require( [ "./atese-common.js", "dojo/dom", "dojo/dom-construct", "dojo/when",
	   "dojo/on", "dojo/_base/lang", "dojo/dom-attr", "dojo/dom-class", "dojo/number" ],
	 function(atese, dom, domConstruct, when, on, lang, domAttr, domClass, number) {

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
	     
	     // Flux densities.
	     // The flux densities close to 5.5 GHz.
	     var ffds = atese.valueAllSources([ 'fluxDensityFit', 'closest5.5', 1 ], {
	       'minmaxSelection': true
	     }).map(Math.log10);
	     storeResult("logFluxDensitiesNear5.5", ffds);
	     //console.log(atese.calculate_minmax(ffds.values));
	     storeResult("minmax_logFluxDensitiesNear5.5", atese.calculate_minmax(ffds));
	     //storeResult("logFluxDensitiesNear5.5Sources", ffds.sources);

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
	     storeResult("minmax_closurePhases", atese.calculate_minmax(fclosurePhases));

	     // Fit scatters.
	     var fscatters = atese.valueAllSources([ 'fluxDensityFit', 'fitScatter' ], {
	       'minmaxSelection': true
	     }).map(Math.log10);
	     storeResult("logFitScatters", fscatters);

	     // Number of measurements.
	     var nmeas = atese.valueAllSources([ 'epochs' ], {
	       'flatten': false, 'minmaxSelection': true
	     }).map(function(a) {
	       return Math.log10(a.length);
	     });
	     storeResult("logNumMeasurements", nmeas);

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
	     var fdsRange = getSliderValues("fds-slider");
	     var filter_ffds = ffds.map(measurementFilterFunction(fdsRange));

	     // Flux densities at 5.5 GHz.
	     var fms = fetchResult("logFluxDensitiesAt5.5");
	     var fmsRange = getSliderValues("fms-slider");
	     var filter_fms = fms.map(measurementFilterFunction(fmsRange));

	     // Defects.
	     var def = fetchResult("logDefects");
	     var defRange = getSliderValues("defect-slider");
	     var filter_def = def.map(measurementFilterFunction(defRange));

	     // Closure phases.
	     var clp = fetchResult("closurePhases");

	     // Fit scatters.
	     var fts = fetchResult("logFitScatters");

	     // Number of measurements.
	     
	     // Alphas.
	     var alp = fetchResult("alphas5.5");

	     // Solar angles.
	     var sol = fetchResult("solarAngles");
	     
	     // Now make a master filter array.
	     var filterArray = [];
	     for (var i = 0; i < filter_ffds.length; i++) {
	       filterArray[i] = filter_ffds[i] && filter_fms[i] && filter_def[i];
	     }
	     
	     // And filter the arrays.
	     var arrFilter = filterFromArray(filterArray);
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
	     var filtered_alp = alp.map(function(a) {
	       return a.filter(arrFilter);
	     });
	     storeResult("alphas5.5", filtered_alp);
	     var filtered_sol = sol.filter(arrFilter);
	     storeResult("solarAngles", filtered_sol);
	   };
	   
	   var fdsHistogram = function(domNode) {
	     // This makes a histogram of the flux densities measured as close to 5.5 GHz
	     // as possible.
	     var fds = fetchResult("logFluxDensitiesNear5.5");
	     domAttr.set('nmeasurements-shown', "innerHTML", fds.length);
	     
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
	     var nmeas = fetchResult("logNumMeasurements");
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
	     var clophas = fetchResult("closurePhases");
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

	   var makeSliders = function() {
	     // This routine adds all the sliders that we want to the page.
	     var fdsMinMax = fetchResult('minmax_logFluxDensitiesNear5.5');
	     domAttr.set(addSlider('fds-slider', fdsMinMax.min, fdsMinMax.max),
			 'innerHTML', "log(fd near 5.5GHz)");
	     
	     var fmsMinMax = fetchResult('minmax_logFluxDensitiesAt5.5');
	     domAttr.set(addSlider('fms-slider', fmsMinMax.min, fmsMinMax.max),
			 'innerHTML', "log(fd at 5.5GHz)");

	     var defMinMax = fetchResult('minmax_logDefects');
	     domAttr.set(addSlider('defect-slider', defMinMax.min, defMinMax.max),
			 'innerHTML', "log(defect [%])");
	     
	     on(dom.byId('button-update'), 'click', function() {
	       // Get all the ranges.
	       var fdsRange = getSliderValues('fds-slider');
	       var fmsRange = getSliderValues('fms-slider');
	       var defRange = getSliderValues('defect-slider');

	       // Clear out our data storage.
	       resStor = {};
	       // Reset the restrictions.
	       atese.resetSelection_minmax();

	       // Go through and make the selections.
	       atese.restrictSelection_minmax('closest5.5', fdsRange[0], fdsRange[1]);
	       atese.restrictSelection_minmax('at5.5', fmsRange[0], fmsRange[1]);
	       atese.restrictSelection_minmax('defect', Math.pow(10, fmsRange[0]), Math.pow(10, fmsRange[1]));
	       
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
	     if (!firstVisualise) {
	       measurementFilter();
	     }
	     
	     domAttr.set('nsources-selected', 'innerHTML', fetchResult("numSelectedSources"));
	     
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
		 console.log(graphDiv.data);
		 console.log(graphDiv.layout);
		 graphDiv.data[0].marker.size = markerSizes;
		 graphDiv.layout.geo.lonaxis.range = [];
		 graphDiv.layout.geo.lataxis.range = [];
		 Plotly.redraw(graphDiv);
	       });
	     }

	     firstVisualise = false;

	   };
	     
	   // Grab the data, then do the visualisations.
	   atese.setSorting('random');
	   atese.getCatalogue().then(visualise).then(makeSliders);

	 });
