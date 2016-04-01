define( [ "./atese-common.js", "dojox/charting/Chart", "dojox/charting/SimpleTheme",
	  "dojo/dom", "dojo/dom-attr", "dojo/dom-class", "dojo/_base/Color",
	  "dojo/dom-construct", "dojo/number", "dojox/charting/themes/PrimaryColors",
	  "astrojs/useful", "dojo/when", "dojo/dom-style",
	  "dojox/charting/plot2d/Scatter", "dojox/charting/plot2d/Markers",
	  "dojox/charting/plot2d/Lines", "dojox/charting/plot2d/Default",
	  "dojox/charting/axis2d/Default", "dojox/charting/plot2d/Areas" ],
	function(atese, Chart, SimpleTheme, dom, domAttr, domClass, Colour, domConstruct, number,
		 theme, useful, when, domStyle) {
	  
	  // The object we return to our caller.
	  var rObj = {};
	  
	  // Private variables.
	  
	  // A theme for our flux density plots.
	  var _myTheme = new SimpleTheme({
	    'markers': {
	      'CROSS': "m0,-3 l0,6 m-3,-3 l6,0",
	      'CIRCLE': "m-3,0 c0,-4 6,-4 6,0 m-6,0 c0,4 6,4 6,0",
	      'SQUARE': "m-3,-3 l0,6 6,0 0,-6 z", 
	      'DIAMOND': "m0,-3 l3,3 -3,3 -3,-3 z", 
	      'TRIANGLE': "m-3,3 l3,-6 3,6 z", 
	      'TRIANGLE_INVERTED': "m-3,-3 l3,6 3,-6 z"
	    }
	  });
	  var _plotProperties = {
	    'inverted': [ { 'stroke': { 'color': 'red' },
			    'fill': 'red', 'marker': _myTheme.markers.TRIANGLE } ],
	    'flat': [ { 'stroke': { 'color': 'blue' } ,
			'fill': 'blue', 'marker': _myTheme.markers.CIRCLE } ],
	    'steep': [ { 'stroke': { 'color': 'green' },
			 'fill': 'green', 'marker': _myTheme.markers.TRIANGLE_INVERTED } ]
	  };
	  var _chartFont = 'normal normal bold 8pt Source Sans Pro';
	  
	  // The object controlling the ID generator.
	  var _idMethods = {};
	   
	  // Our public methods.
	  // Allow our caller to set up our ID generator.
	  var _setIdGenerator = function(idGenerator) {
	    for (var k in idGenerator) {
	      if (idGenerator.hasOwnProperty(k)) {
		_idMethods[k] = idGenerator[k];
	      }
	    }
	  };
	  rObj.setIdGenerator = _setIdGenerator;
	  
	  // Make a flux density vs time plot for a source.
	  var _fluxDensityTimePlot = function(src) {
	    // Check the plot area has been put on the page.
	    var plotId = _idMethods.plotId(src);
	    if (!dom.byId(plotId)) {
	      return;
	    }
	    // Remove any hidden class.
	    domClass.remove(plotId, "hidden");
	    
	    // Only make plots for those sources with more than one measurement.
	    var nEpochs = atese.numEpochs(src);
	    if (nEpochs < 2) {
	      // Just put the text "NO IMAGE" in the box.
	      domAttr.set(plotId, 'innerHTML', "NO PLOT");
	      domClass.add(plotId, "plot-no-plot");
	      return;
	    }
	    
	    var sourceInfo = atese.getFluxDensityInformation(src);
	    var mjd = atese.getSourceProperty(src, "mjd");
	    
	    // Generate the series for each different spectral index type.
	    var fluxes = {
	      'inverted': [], 'flat': [], 'steep': []
	    };
	    for (var i = 0; i < mjd.length; i++) {
	      var tflux = {
		'x': mjd[i],
		'y': sourceInfo.computedFluxDensity[i]
	      };
		if (sourceInfo.fitValid[i]) {
		    fluxes[sourceInfo.siClassification[i]].push(tflux);
		}
	    }
	    
	    // Don't do anything if we have no fluxes.
	    var totalFluxes = fluxes.inverted.length + fluxes.flat.length +
		fluxes.steep.length;
	    if (totalFluxes === 0) {
	      return;
	    }
	    
	    // Make the chart if required.
	    var chartObject = atese.getSourceProperty(src, 'chartObject');
	    if (typeof chartObject === 'undefined') {
	      chartObject = {};
	      chartObject.chart = new Chart(plotId).setTheme(_myTheme);
	    }
	    
	    // Determine the axis ranges.
	    var minMjd = Math.min.apply(this, mjd) - 20;
	    var maxMjd = Math.max.apply(this, mjd) + 20;
	    
	    chartObject.plot = chartObject.chart.addPlot('default', {
	      'type': "Scatter"
	    });
	    chartObject.xAxis = chartObject.chart.addAxis('x', {
	      'font': _chartFont,
	      'titleFont': _chartFont,
	      'title': "MJD",
	      'titleGap': 5,
	      'titleOrientation': "away",
	      'minorLabels': false,
	      'natural': false,
	      'min': minMjd,
	      'max': maxMjd
	    });
	    chartObject.yAxis = chartObject.chart.addAxis('y', {
	      'font': _chartFont,
	      'titleFont': _chartFont,
	      'title': "f.d. [Jy/beam]",
	      'titleGap': 5,
	      'titleOrientation': "axis",
	      'natural': false,
	      'fixed': false,
	      'vertical': true,
	      'fixLower': "major",
	      'fluxUpper': "major",
	      'min': 0.0,
	      'max': sourceInfo.maxFluxDensity * 1.2
	    });
	    
	    // Make a plot showing the average flux density level.
	    chartObject.avgPlot = chartObject.chart.addPlot('average', {
	      'type': "Areas", 'lines': false, 'areas': true, 'markers': false
	    });
	    var avgSeries = [ { 'x': minMjd, 'y': sourceInfo.avgFluxDensity },
			      { 'x': maxMjd, 'y': sourceInfo.avgFluxDensity } ];
	    chartObject.avgSeries = chartObject.chart.addSeries("average-flux", avgSeries, {
	       'plot': "average", 'fill': "#cccccc", 'stroke': { 'color': "#cccccc" }
	    });
	    
	    // Overplot the flux densities and spectral index indications.
	    for (var s in fluxes) {
	      if (fluxes.hasOwnProperty(s) &&
		  fluxes[s].length > 0) {
		chartObject.fdSeries = chartObject.chart.addSeries(_idMethods.seriesId(src, s),
								   fluxes[s], _plotProperties[s][0]);
	      }
	    }
	    
	    chartObject.chart.render();
	    
	    // Store the chart for later use.
	    atese.setSourceProperty(src, 'chartObject', chartObject);
	  };
	  rObj.fluxDensityTimePlot = _fluxDensityTimePlot;

	  // Fill in a flux density measurements table for a source.
	  var _fluxDensityTableFill = function(src, tableCells) {
	    // Find the table, and clear it.
	    var mBody = atese.getSourceProperty(src, "tableBody");
	    domConstruct.empty(mBody);

	    var sourceInfo = atese.getFluxDensityInformation(src);
	    var nEpochs = atese.numEpochs(src);
	    for (var i = 0; i < nEpochs; i++) {
	      var epochInfo = atese.getEpochInformation(src, i);
		// Check which bands it uses.
		var rowClass = "only4cm";
		if (epochInfo.frequencyRange[0] < 4.0) {
		    // We have 16cm data.
		    if (epochInfo.frequencyRange[1] < 4.0) {
			// We have only 16cm data.
			rowClass = "only16cm";
		    } else {
			// We have both bands.
			rowClass = "both4and16cm";
		    }
		}
		var mRow = domConstruct.create('tr', {
		    'class': rowClass
		}, mBody);
	      for (var j = 0; j < tableCells.length; j++) {
		var cellContents = null;
		if (tableCells[j] === "mjd") {
		  cellContents = epochInfo.mjd;
		} else if (tableCells[j] === "epoch") {
		  cellContents = epochInfo.epoch;
		} else if (tableCells[j] === "rightAscension") {
		  cellContents = epochInfo.rightAscension;
		} else if (tableCells[j] === "declination") {
		  cellContents = epochInfo.declination;
		} else if (tableCells[j] === "fluxDensity") {
		  var fd = number.round(sourceInfo.computedFluxDensity[i], 3);
		  cellContents = fd + " +/- " + epochInfo.fluxDensityScatter;
		} else if (tableCells[j] === "spectralIndex") {
		  cellContents = number.round(sourceInfo.computedSpectralIndex[i], 3);
		} else if (tableCells[j] === "closurePhase") {
		  if (epochInfo.closurePhase === -999) {
		    cellContents = "N/A";
		  } else {
		    cellContents = epochInfo.closurePhase;
		  }
		} else if (tableCells[j] === "defect") {
		  cellContents = epochInfo.defect;
		} else if (tableCells[j] === "solarAngle") {
		  var sa = number.round(epochInfo.solarAngle, 1);
		  cellContents = sa;
		}
		domConstruct.create('td', {
		  'innerHTML': cellContents
		}, mRow);
	      }
	    }

	  };
	  rObj.fluxDensityTableFill = _fluxDensityTableFill;

	  // Make a spectra plot.
	  var _fluxDensitySpectraPlot = function(src, startIndex, nSpectra, avg) {
	    // Check the plot area has been put on the page.
	    var plotId = _idMethods.spectraId(src);
	    if (!dom.byId(plotId)) {
	      return;
	    }

	    // Make the chart if required.
	    var spectraChart = atese.getSourceProperty(src, 'spectraChart');
	    if (typeof spectraChart === 'undefined') {
	      spectraChart = {};
	      spectraChart.chart = new Chart(plotId).setTheme(theme);

	      // Add the axes.
	      spectraChart.plot = spectraChart.chart.addPlot('default', {
		'type': "Lines"
	      });
	      spectraChart.xAxis = spectraChart.chart.addAxis('x', {
		'font': _chartFont,
		'titleFont': _chartFont,
		'title': "Frequency [GHz]",
		'titleOrientation': "away",
		'titleGap': 5,
		'minorLabels': false,
		'natural': false
	      });
	      spectraChart.yAxis = spectraChart.chart.addAxis('y', {
		'font': _chartFont,
		'titleFont': _chartFont,
		'title': "f.d. [Jy/beam]",
		'titleOrientation': "axis",
		'titleGap': 5,
		'natural': false,
		'fixed': false,
		'vertical': true,
		'min': 0.0
	      });
	    } else {
	      // Empty all the series that have currently been plotted.
	      console.log("remaking plot " + src);
	      for (var i = 0; i < spectraChart.spectraSeries.length; i++) {
		spectraChart.chart.removeSeries(spectraChart.spectraSeries[i]);
	      }
	      
	      // And clear the legend div.
	      domConstruct.empty(_idMethods.legendId(src));
	    }
	    
	    // Set up an array that holds the state of the plot.
	    var spectraObtained = {};
	    for (var i = 0; i < nSpectra; i++) {
	      var n = startIndex + i;
	      var en = atese.getEpochName(src, n);
	      spectraObtained[en] = false;
	    }
	    
	    // Get each of the required epochs for this source.
	    spectraChart.spectraSeries = [];
	    // Only allow for darkish colours because we're on a white background.
	    var en = 0;
	    for (var i = 0; i < nSpectra; i++) {
	      var n = startIndex + i;
	      var nc = n + en;

	      var tcol = Colour.fromHex(useful.getColour(nc));
              var tbg = useful.foregroundColour(tcol);
	      while (!tbg.r) {
		  en += 1;
		  nc = n + en;
		  tcol = Colour.fromHex(useful.getColour(nc));
                  tbg = useful.foregroundColour(tcol);
	      }
	      // Add to the legend box.
	      var leg = domConstruct.create('div', {
		'innerHTML': atese.getEpochName(src, n)
	      }, _idMethods.legendId(src));
	      domStyle.set(leg, "color", tcol);
	      when(atese.getEpochSpectrum(src, n, tcol, avg), function(spectraData) {
		// Plot the spectrum on the plot.
		if (typeof spectraData === 'undefined') {
		  // Something went wrong.
		  return;
		}

		// Plot the data in the pre-determined chunks.
		for (var j = 0; j < spectraData.chartChunks.startIndex.length; j++) {
		  var spdata = spectraData.chartData.slice(
		    spectraData.chartChunks.startIndex[j],
		    spectraData.chartChunks.endIndex[j]);
		  if (spdata.length > 0) {
		    var seriesName = "epoch-" + spectraData.epochName + "-" + j;
		    spectraChart.spectraSeries.push(seriesName);
		    spectraChart.chart.addSeries(seriesName, spdata, {
		      'stroke': { 'color': spectraData.specColour }
		    });
		  }
		}
		spectraObtained[spectraData.epochName] = true;

		// Check if we can render the plot yet.
		var canRender = true;
		for (var p in spectraObtained) {
		  if (spectraObtained.hasOwnProperty(p) &&
		      spectraObtained[p] === false) {
		    canRender = false;
		    break;
		  }
		}

		// Render the plot if we have added all the data.
		if (canRender) {
		  spectraChart.chart.render();
		}
	      });
	    }
	    atese.setSourceProperty(src, 'spectraChart', spectraChart);
		   
	  };
	  rObj.fluxDensitySpectraPlot = _fluxDensitySpectraPlot;
	  
	  return rObj;
	  
	});
