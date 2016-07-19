require( [ "./atese-common.js", "dojo/dom", "dojo/dom-construct", "dojo/when",
	   "dojo/on", "dojo/_base/lang" ],
	 function(atese, dom, domConstruct, when, on, lang) {

	   var plotHistogram = function(xvals, domNode, layoutOptions) {
	     var pd = [ { 'x': xvals, 'type': 'histogram' } ];

	     var defltLayout = { 'xaxis': { 'type': 'linear', 'autorange': true, 'showline': true, 'mirror': true,
					    'title': "Please specify title" },
				 'yaxis': { 'type': 'log', 'autorange': true, 'showline': true, 'mirror': true,
					    'title': "Please specify title" } };

	     // Mix in defaults with the specified options.
	     atese.mixin(defltLayout, layoutOptions);

	     Plotly.newPlot(domNode, pd, defltLayout);
	   };
	   
	   var fdsHistogram = function(domNode) {
	     // This makes a histogram of the flux densities measured as close to 5.5 GHz
	     // as possible.
	     var fds = atese.valueAllSources([ 'fluxDensityFit', 'closest5.5', 1 ], { 'log': true });
	     plotHistogram(fds, domNode, { 'xaxis': { 'title': "log(Measured flux density near 5.5 GHz [Jy])" },
					   'yaxis': { 'title': "Number of measurements" } });
	   };

	   var fmsHistogram = function(domNode) {
	     // This computes and makes a histogram of the flux models evaluated at 5.5 GHz.
	     var fms = atese.valueAllSources([ 'fluxDensityFit', 'fitCoefficients' ]);
	     
	     var fd55 = function(a) {
	       return Math.log10(atese.fluxModel2Density(a, 5500));
	     };
	     var fds = fms.map(fd55);
	     plotHistogram(fds, domNode, { 'xaxis': { 'title': "log(Evaluated flux density at 5.5 GHz [Jy])" },
					   'yaxis': { 'title': "Number of measurements" } });

	   };

	   var defectHistogram = function(domNode) {
	     // This makes a histogram of all the defects.
	     var defs = atese.valueAllSources([ 'defect' ], { 'log': true });
	     plotHistogram(defs, domNode, { 'xaxis': { 'title': "log(Defect [%])" },
					    'yaxis': { 'title': "Number of measurements" } });
	   };

	   var closurePhaseHistogram = function(domNode) {
	     // This makes a histogram of all the closure phases.
	     var clophas = atese.valueAllSources([ 'closurePhase' ]).filter(atese.scrubArray(-999));
	     plotHistogram(clophas, domNode, { 'xaxis': { 'title': "Closure phase [deg]" },
					       'yaxis': { 'title': "Number of measurements" } });
	   };

	   var fitrmsHistogram = function(domNode) {
	     // This makes a histogram of all the RMS fit scatters.
	     var scatters = atese.valueAllSources([ 'fluxDensityFit', 'fitScatter' ], { 'log': true });
	     plotHistogram(scatters, domNode, { 'xaxis': { 'title': "log(Fit Scatter RMS [Jy])" },
						'yaxis': { 'title': "Number of measurements" } });
	   };

	   var nmeasHistogram = function(domNode) {
	     // This makes a histogram of the number of measurements per source.
	     var meas = atese.valueAllSources([ 'epochs' ], { 'flatten': false });
	     var nmeas = meas.map(function(a) { return Math.log10(a.length); });
	     plotHistogram(nmeas, domNode, { 'xaxis': { 'title': "log(Number of measurements)" },
					     'yaxis': { 'title': "Number of sources" } });
	   };
	   
	   var alphasHistograms = function(domNodes) {
	     // This makes several histograms of the fit alphas.
	     for (var i = 0; i < domNodes.length; i++) {
	       var o = {};
	       if (i === 0) {
		 o = { 'log': true };
	       }
	       var alphas = atese.valueAllSources([ 'fluxDensityFit', 'alphas5.5', i ], o);
	       plotHistogram(alphas, domNodes[i], { 'xaxis': { 'title': "&alpha;<sub>" + i + "</sub>" },
						    'yaxis': { 'title': "Number of measurements" } });
	     }
	   };

	   var solarHistogram = function(domNode) {
	     var soldist = atese.valueAllSources([ 'solarAngles' ]);
	     plotHistogram(soldist, domNode, { 'xaxis': { 'title': "Solar distance [deg]" },
					       'yaxis': { 'title': "Number of measurements" } });

	   };
	   
	   // The master visualisation routine.
	   var visualise = function(data) {
	     console.log(data);

	     fdsHistogram(dom.byId('vis-fd-near55'));
	     fmsHistogram(dom.byId('vis-fd-eval55'));
	     defectHistogram(dom.byId('vis-defect'));
	     closurePhaseHistogram(dom.byId('vis-closurephase'));
	     fitrmsHistogram(dom.byId('vis-fitrms'));
	     nmeasHistogram(dom.byId('vis-nmeasurements'));
	     alphasHistograms([ 'vis-a0', 'vis-a1', 'vis-a2', 'vis-a3' ]);
	     solarHistogram(dom.byId('vis-solarangles'));
	   };

	   // Grab the data, then do the visualisations.
	   atese.getCatalogue().then(visualise);
	 });
