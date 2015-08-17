require( [ "dojo/dom-construct", "dojo/request/xhr", "dojo/dom", "astrojs/skyCoordinate",
	   "astrojs/base", "dojo/number", "dojox/charting/Chart", "dojox/charting/SimpleTheme",
	   "dojo/on", "dojo/dom-geometry", "dojo/window", "dojo/dom-attr", "dojo/dom-class",
	   "dojo/query", "dojox/timing", "dojox/charting/themes/PrimaryColors", "dojo/dom-style",
	   "astrojs/useful", "dojo/when", "astrojs/time", "dojo/_base/Color",
	   "dojox/charting/plot2d/Scatter", "dojox/charting/plot2d/Markers",
	   "dojox/charting/plot2d/Lines", "dojox/charting/plot2d/Default",
	   "dojox/charting/axis2d/Default", "dojo/NodeList-dom", "dojox/charting/plot2d/Areas",
	   "dojo/domReady!" ],
  function(domConstruct, xhr, dom, skyCoord, astrojs, number, Chart, SimpleTheme, on, domGeom,
	   win, domAttr, domClass, query, timing, theme, domStyle, useful, when, astroTime, Colour) {

    // Take a flux model and return the flux density at the
    // specified frequency.
    var fluxModel2Density = function(model, frequency) {
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
    var fluxModel2Slope = function(model, frequency) {
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
    

    // The arrays controlling the layout of the measurement tables.
    var headCells = [ "MJD", "Epoch", "RA", "Dec", "Flux Density (Jy/beam)",
		      "Spectral Index", "Closure Phase (deg)", "Defect (%)" ]
    var cellIds = [ 'mjd', 'epoch', 'ra', 'dec', 'flux', 'specind', 'closure', 'defect' ];
    var frequencyEval = parseFloat(domAttr.get('input-fd-frequency', 'value')); // MHz
    // The spectral indices considered to be the range of "flat".
    // A spectral index more positive will be considered inverted, and more
    // negative considered steep.
    var flatRange = [];
    var getFlatRange = function() {
      // Read the flat range from the input boxes.
      flatRange[0] = parseFloat(domAttr.get('input-si-flat-low', 'value'));
      flatRange[1] = parseFloat(domAttr.get('input-si-flat-high', 'value'));
    };
    getFlatRange();
    
    var cellProcess = [
      // MJD
      function(o, i) { return o.mjd[i]; },
      // Epoch
      function(o, i) { return o.epochs[i]; },
      // RA
      function(o, i) { return o.rightAscension[i]; },
      // Dec
      function(o, i) { return o.declination[i]; },
      // Flux Density
      function(o, i) {
	var fd = number.round(fluxModel2Density(o.fluxDensityFit[i].fitCoefficients,
						frequencyEval), 3);
	o.computedFluxDensity[i] = fd;
	return (fd + " +/- " + o.fluxDensityFit[i].fitScatter);
      },
      // Spectral Index
      function(o, i) {
	var si = number.round(fluxModel2Slope(o.fluxDensityFit[i].fitCoefficients,
					      frequencyEval), 3);
	o.computedSpectralIndex[i] = si;
	if (si < flatRange[0]) {
	  o.siClassification[i] = "steep";
	} else if (si > flatRange[1]) {
	  o.siClassification[i] = "inverted";
	} else {
	  o.siClassification[i] = "flat";
	}
	return si;
      },
      // Closure Phase
      function(o, i) {
	if (o.closurePhase[i] === -999) {
	  return "N/A";
	}
	return o.closurePhase[i]; },
      // Defect
      function(o, i) { return o.defect[i]; }
    ];

    // The theme for our plots.
    var myTheme = new SimpleTheme({
      'markers': {
	'CROSS': "m0,-3 l0,6 m-3,-3 l6,0",
	'CIRCLE': "m-3,0 c0,-4 6,-4 6,0 m-6,0 c0,4 6,4 6,0",
	'SQUARE': "m-3,-3 l0,6 6,0 0,-6 z", 
	'DIAMOND': "m0,-3 l3,3 -3,3 -3,-3 z", 
	'TRIANGLE': "m-3,3 l3,-6 3,6 z", 
	'TRIANGLE_INVERTED': "m-3,-3 l3,6 3,-6 z"
      }
    });
    var plotProperties = {
      'inverted': [ { 'stroke': { 'color': 'red' }, 'fill': 'red', 'marker': myTheme.markers.TRIANGLE } ],
      'flat': [ { 'stroke': { 'color': 'blue' } , 'fill': 'blue', 'marker': myTheme.markers.CIRCLE } ],
      'steep': [ { 'stroke': { 'color': 'green' }, 'fill': 'green', 'marker': myTheme.markers.TRIANGLE_INVERTED } ]
    };
    
    // The list of all sources.
    var ateseSources = [];
    
    var sourceList = [];
    // The node list of all the panels.
    var panelList = null;
    
    // Some functions to sort the sources in different ways.
    // This function sorts by ascending right ascension.
    var sortByRA = function(a, b) {
      var ara = ateseSources[a].coordinate.toJ2000().rightAscension.toDegrees();
      var bra = ateseSources[b].coordinate.toJ2000().rightAscension.toDegrees();
      
      return (ara - bra);
    };
    
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
    
    var sortSources = function() {
      sourceList.sort(sortByRA);
    };

    var selectOneSource = function(src, nstate) {
      if (ateseSources.hasOwnProperty(src)) {
	if (typeof nstate !== 'undefined' && typeof nstate === 'boolean') {
	  ateseSources[src].selected = nstate;
	} else {
	  ateseSources[src].selected = !ateseSources[src].selected;
	}
	if (ateseSources[src].selected) {
	  domClass.add("source-div-title-" + src, 'source-div-title-selected');
	} else {
	  domClass.remove("source-div-title-" + src, 'source-div-title-selected');
	}
      }
      return ateseSources[src].selected;
    };

    var oneSourceSelected = function(evt) {
      var src = evt.target.id.replace("source-title-selector-", "");
      selectOneSource(src);
      countSelected();
    };

    var bulkSelection = function(evt) {
      var v = undefined;
      if (evt.target.id === 'source-selection-select-all') {
	v = true;
      } else if (evt.target.id === 'source-selection-select-none') {
	v = false;
      }
      for (var i = 0; i < sourceList.length; i++) {
	selectOneSource(sourceList[i], v);
      }
      countSelected();
    };

    on(dom.byId('source-selection-select-all'), 'click', bulkSelection);
    on(dom.byId('source-selection-select-none'), 'click', bulkSelection);
    on(dom.byId('source-selection-select-invert'), 'click', bulkSelection);

    var downloadRequired = {};
    var downloadTotal = 0;
    var produceDownload = function() {
      // Get the sources that are selected.
      var selectedSources = countSelected();

      // Hide the download button and show the progress.
      domClass.add('source-selection-indicator', 'hidden');
      domClass.add('button-source-data-download', 'hidden');
      domClass.remove('source-download-indicator', 'hidden');
      
      downloadRequired = {};
      downloadTotal = 0;
      for (var i = 0; i < selectedSources.length; i++) {
	var src = selectedSources[i];
	downloadRequired[src] = {};
	for (var j = 0; j < ateseSources[src].epochs.length; j++) {
	  var epoch = ateseSources[src].epochs[j];
	  downloadRequired[src][epoch] = true;
	  downloadTotal++;
	  when(getASpectrum(src, epoch), checkDownload);
	}
      }

      // Update the progress indicator.
      domAttr.set('source-download-indicator', 'innerHTML',
		  "Collating epochs: 0 of " + downloadTotal);

    };

    var checkDownload = function(data) {
      var done = 0;
      // Mark the incoming data as done.
      if (typeof data !== 'undefined') {
	if (downloadRequired.hasOwnProperty(data.source) &&
	    downloadRequired[data.source].hasOwnProperty(data.epochName)) {
	  downloadRequired[data.source][data.epochName] = false;
	}
      }
      for (var src in downloadRequired) {
	if (downloadRequired.hasOwnProperty(src)) {
	  for (var epoch in downloadRequired[src]) {
	    if (downloadRequired[src].hasOwnProperty(epoch)) {
	      if (!downloadRequired[src][epoch]) {
		done++;
	      }
	    }
	  }
	}
      }

      // Update the progress indicator.
      domAttr.set('source-download-indicator', 'innerHTML',
		  "Collating epochs: " + done + " of " + downloadTotal);
      
      if (done === downloadTotal) {
	// Prepare the download package.
	var pkg = {};
	for (var src in downloadRequired) {
	  if (downloadRequired.hasOwnProperty(src)) {
	    pkg[src] = {
	      'source': src,
	      'rightAscension': ateseSources[src].rightAscension[0],
	      'declination': ateseSources[src].declination[0],
	      'epochData': []
	    };
	    for (var epoch in downloadRequired[src]) {
	      if (downloadRequired[src].hasOwnProperty(epoch)) {
		pkg[src].epochData.push(ateseSources[src].spectralData[epoch]);
	      }
	    }
	  }
	}
	// Package complete, ask the user to save it.
	// The name of the file should include the date right now.
	var ctime = astroTime.new();
	var fname = "ATESE_data_" + ctime.timeString("%y-%O-%d_%H-%M") + ".json";
	saveTextAs(JSON.stringify(pkg), fname);

	// Show the download button and hide the progress.
	domClass.remove('source-selection-indicator', 'hidden');
	domClass.remove('button-source-data-download', 'hidden');
	domClass.add('source-download-indicator', 'hidden');

      }
    };
    
    on(dom.byId('button-source-data-download'), 'click', produceDownload);
    
    // This function makes a panel on the page for a named source.
    var makeSourcePanel = function(src) {
      // Make the container div; this will be returned later.
      var sdiv = domConstruct.create('div', {
	'id': "source-" + src,
	'class': "source-div"
      });
      
      // How many epochs has this source been observed in?
      var nEpochs = ateseSources[src].epochs.length;
      
      // The title is the RA and Dec of the source, along with the
      // number of epochs it has been observed in.
      var titleText = src.toUpperCase() +
	  " (" + ateseSources[src].rightAscension[0] + ", " +
	  ateseSources[src].declination[0] + ") [ " +
	  nEpochs + " epoch" + ((nEpochs > 1) ? "s" : "") + " ]";
      
      // Make the title of the panel.
      var stitle = domConstruct.create('div', {
	'class': "source-div-title",
	'id': "source-div-title-" + src,
	'innerHTML': titleText
      }, sdiv);

      var titleSelector = domConstruct.create('div', {
	'class': "source-title-selector",
	'innerHTML': "select",
	'id': "source-title-selector-" + src
      }, stitle);
      on(titleSelector, 'click', oneSourceSelected);
      
      // Make the div for the plots.
      var phdiv = domConstruct.create('div', {
	'class': "plotholder-div"
      }, sdiv);
      var pdiv = domConstruct.create('div', {
	'id': 'plot-' + src,
	'class': "plot-div"
      }, phdiv);
      // The link to plot the spectra.
      var speclink = domConstruct.create('div', {
	'id': 'spectralink-' + src,
	'class': "spectra-link",
	'innerHTML': "Plot Spectra"
      }, phdiv);
      // Connect it to its handler.
      on(speclink, 'click', handleSpectraPlot);

      var spdiv = domConstruct.create('div', {
	'id': 'spectraplot-' + src,
	'class': "spectraplot-div hidden"
      }, phdiv);

      // Make the div for the table.
      var tdiv = domConstruct.create('div', {
	'id': 'table-' + src,
	'class': "table-div"
      }, sdiv);
      
      // Make the measurements table.
      var mTable = domConstruct.create('table', {
	'class': "source-div-measurements-table",
      }, tdiv);
      
      // Make the header for the table.
      var mHead = domConstruct.create('thead', null, mTable);
      var mHeadRow = domConstruct.create('tr', null, mHead);

      for (var i = 0; i < headCells.length; i++) {
	var mhCell = domConstruct.create('td', {
	  'innerHTML': headCells[i]
	}, mHeadRow);
      }
      
      // Make the body for the table - we don't populate this, that's
      // up to another routine.
      var mBody = domConstruct.create('tbody', {
	'id': 'measurements-' + src
      }, mTable);
      
      // The clearing div.
      var cdiv = domConstruct.create('div', {
	'class': "clear-div"
      }, sdiv);

      
      return sdiv;
    };
    
    var averageArray = function() {
      var s = 0.0;
      var args = arguments;
      for (var a in args) {
	s += args[a];
      }
      s /= args.length;
      
      return s;
    };

    var handleSpectraPlot = function(e) {
      // Get the name of the source to plot.
      var name = e.target.id.replace("spectralink-", "");
      makeSourceSpectraPlot(name);
      // Hide the link now.
      domClass.add(e.target, 'hidden');
    };
    
    
    var chartFont = 'normal normal bold 8pt Source Sans Pro';

    // This function makes a spectral plot for a source.
    var makeSourceSpectraPlot = function(src) {
      // Make the plot.
      var schart = new Chart('spectraplot-' + src).setTheme(theme);
      schart.addPlot('default', { 'type': 'Lines' });
      schart.addAxis('x', {
	'titleOrientation': 'away',
	'font': chartFont,
	'titleFont': chartFont,
	'title': "Frequency [GHz]",
	'minorLabels': false,
	'natural': false
      });
      schart.addAxis('y', {
	'titleOrientation': 'axis',
	'title': "Flux Density (Jy/beam)",
	'natural': false,
	'fixed': false,
	'vertical': true,
	'font': chartFont,
	'titleFont': chartFont,
	'min': 0.0
      });
      ateseSources[src].spectralPlot = schart;

      // Get each of the epochs for this source.
      for (var i = 0; i < ateseSources[src].epochs.length; i++) {
	ateseSources[src].spectraPlotted[ateseSources[src].epochs[i]] = false;
	var tcol = useful.getColour(i);
	when(getASpectrum(src, ateseSources[src].epochs[i], tcol), plotAddSpectrum);
      }
    };

    var getASpectrum = function(src, epoch, specColour) {
      if (!ateseSources.hasOwnProperty(src)) {
	return null;
      }
      if (typeof specColour !== 'undefined' && specColour) {
	ateseSources[src].specColour[epoch] = Colour.fromHex(specColour);
      }

      if (ateseSources[src].spectralData.hasOwnProperty(epoch)) {
	// We already have the data.
	return ateseSources[src].spectralData[epoch];
      } else {
	// Form the file name.
	var efname = epoch + "/" + src + "_" + epoch + ".json";
	// Grab the file.
	return xhr.get("datarelease/" + efname, {
	  'handleAs': "json"
	}).then(function(data) {
	  if (typeof data === 'undefined') {
	    return null;
	  }
	  var s = data.source;
	  var e = data.epochName;
	  ateseSources[s].spectralData[e] = data;
	  return data;
	});
	
      }
    };

    var freqSpace = function(v, i, a) {
      if (i == (a.length - 1)) {
	return 0;
      }
      return (a[i + 1][0] - v[0]);
    };
    
    var plotAddSpectrum = function(data) {
      if (typeof data === 'undefined') {
	return;
      }
      // Get the plot.
      var src = data.source;
      var epoch = data.epochName;
      var schart = ateseSources[src].spectralPlot;
      var chCol = ateseSources[src].specColour[epoch];
      
      // Format the Stokes I data.
      var sdata = [];
      var fspacing = [];
      for (var i = 0; i < data.fluxDensityData.length; i++) {
	if (data.fluxDensityData[i].stokes === "I") {
	  sdata = data.fluxDensityData[i].data.map(function(a) {
	    return { 'x': a[0], 'y': a[1] };
	  });
	  fspacing = data.fluxDensityData[i].data.map(freqSpace);
	}
      }

      var startIndex = [ 0 ];
      var endIndex = [];
      for (var i = 1; i < fspacing.length; i++) {
	if (fspacing[i] > 0.14) {
	  endIndex.push(i);
	  startIndex.push(i + 1);
	}
      }
      endIndex.push(fspacing.length);
      for (var i = 0; i < startIndex.length; i++) {
	var spdata = sdata.slice(startIndex[i], endIndex[i]);
	if (spdata.length > 0) {
	  if (i == 0) {
	    schart.addSeries(data.epochName, spdata,
			     { 'stroke': { 'color': chCol } });
	    schart.render();
	  } else {
	    schart.addSeries(data.epochName + '_' + i, spdata,
			     { 'stroke': { 'color': chCol } });
	    schart.render();
	  }
	}
      }
      ateseSources[src].spectraPlotted[data.epochName] = true;
      
      // Show the plot.
      domClass.remove('spectraplot-' + src, 'hidden');

      // Check that everything has plotted.
      var allPlotted = true;
      for (var e in ateseSources[src].spectraPlotted) {
	if (ateseSources[src].spectraPlotted.hasOwnProperty(e) &&
	    !ateseSources[src].spectraPlotted[e]) {
	  allPlotted = false;
	}
      }
      if (allPlotted) {
	for (var e in ateseSources[src].spectraPlotted) {
	  if (ateseSources[src].spectraPlotted.hasOwnProperty(e)) {
	    // var t = schart.getSeries(e);
	    var n = 'measrow-' + src + '-' + e;
	    var fgc = useful.foregroundColour(ateseSources[src].specColour[e]);
	    domStyle.set(n, {
	      'backgroundColor': ateseSources[src].specColour[e],
	      'color': fgc
	    });
	  }
	}
	
      }
    };
    
    // This function makes the plot for a source.
    var makeSourcePlot = function(src) {
      if (ateseSources[src].epochs.length < 2) {
	// Just put the text "NO IMAGE" in the box.
	domAttr.set('plot-' + src, 'innerHTML', "NO PLOT");
	domClass.add('plot-' + src, 'plot-no-plot');
	
	return;
      }
      
      // Make the series.
      var fluxes = {
	'inverted': [], 'flat': [], 'steep': []
      };
      var meas = ateseSources[src];
      var maxFlux = Math.max.apply(this, meas.computedFluxDensity);
      var avgFlux = meas.avgFluxDensity;
      for (var i = 0; i < meas.mjd.length; i++) {
	var tflux = {
	  'x': meas.mjd[i],
	  'y': meas.computedFluxDensity[i]
	};
	fluxes[meas.siClassification[i]].push(tflux);
      }
      
      // Don't do anything if we have no fluxes.
      var totalFluxes = fluxes.inverted.length + fluxes.flat.length +
	  fluxes.steep.length;
      if (totalFluxes === 0) {
	return;
      }
      
      // Make the chart.
      var fchart = new Chart('plot-' + src).setTheme(myTheme);
      
      // Get the axis ranges.
      var minMjd = Math.min.apply(this, meas.mjd) - 20;
      var maxMjd = Math.max.apply(this, meas.mjd) + 20;
      
      fchart.addPlot('default', { 'type': 'Scatter' });
      fchart.addAxis('x', {
	'titleOrientation': 'away',
	'font': chartFont,
	'titleFont': chartFont,
	'minorLabels': false,
	'natural': false,
	'min': minMjd,
	'max': maxMjd
      });
      fchart.addAxis('y', {
	'font': chartFont,
	'titleFont': chartFont,
	'titleOrientation': 'axis',
	'natural': false,
	'fixed': false,
	'vertical': true,
	'fixLower': 'major',
	'fixUpper': 'major',
	'min': 0.0,
	'max': maxFlux * 1.2
      });
      
      // The plot showing the average flux density level.
      fchart.addPlot('average', { 'type': 'Areas', 'lines': false,
				  'areas': true, 'markers': false });
      var avgSeries = [ { 'x': minMjd, 'y': avgFlux },
			{ 'x': maxMjd, 'y': avgFlux } ];
      fchart.addSeries('average-flux', avgSeries, {
	'plot': 'average', 'fill': "#cccccc", 'stroke': { 'color': "#cccccc" }  });
      
      // Overplot the flux densities and spectral index indications.
      for (var s in fluxes) {
	if (fluxes.hasOwnProperty(s) &&
	    fluxes[s].length > 0) {
	  fchart.addSeries("fluxes-" + s + "-" + src,
			   fluxes[s], plotProperties[s][0]);
	}
      }
      fchart.render();
      
    };
    
    // This function arranges the data and puts it in the appropriate
    // measurements table.
    var populateMeasurements = function(src) {
      // Find the table we will populate.
      var mBody = dom.byId('measurements-' + src);
      domConstruct.empty(mBody);
      
      // The measurements we have.
      var meas = ateseSources[src];
      
      // Sort the arrays by ascending MJD.
      var sind = sortWithIndices(meas.mjd);
      
      // Populate the table.
      for (var i = 0; i < sind.length; i++) {
	var mRow = domConstruct.create('tr', {
	  'id': 'measrow-' + src + '-' + meas.epochs[sind[i]]
	}, mBody);
	for (var j = 0; j < headCells.length; j++) {
	  var mCell = domConstruct.create('td', {
	    'innerHTML': cellProcess[j](meas, sind[i])
	  }, mRow);
	}
      }

    };

    var showNSources = function() {
      // Display the number of sources we are showing.
      domAttr.set('nsources-selected', 'innerHTML', sourceList.length);

    };
    
    // Make the page.
    var populatePage = function() {
      var tl = dom.byId('source-area');
      domConstruct.empty(tl);
      for (var i = 0; i < sourceList.length; i++) {
	// Make the source panel and put it on the page.
	var sdiv = makeSourcePanel(sourceList[i]);
	tl.appendChild(sdiv);
	ateseSources[sourceList[i]].domNode = sdiv;
	
	populateMeasurements(sourceList[i]);
	ateseSources[sourceList[i]].plotMade = false;
	
	// Calculate the average flux density for the source.
	ateseSources[sourceList[i]].avgFluxDensity =
	  averageArray.apply(this, ateseSources[sourceList[i]].computedFluxDensity);
	
      }
      showNSources();
    };
    
    // Determine if an element is in the viewport.
    var isInViewport = function(node) {
      // Check if we're hidden.
      if (domClass.contains(node, 'hidden')) {
	return false;
      }
      var nodePos = domGeom.position(node);;
      var viewport = win.getBox();
      return ((nodePos.x > 0) && (nodePos.x < viewport.w) && (nodePos.y > (-1 * viewport.h)) && (nodePos.y < (viewport.h * 2)));
    };
    
    // We want to make plots only when the user has just finished scrolling,
    // so the page always appears responsive.
    var scrollTimer = new timing.Timer(400); // trigger after 400ms.
    
    // This function is used to see if a plot is within the viewport,
    // and if so we make it, if it hasn't already been made.
    var plotCheck = function() {
      // Stop the scroll timer.
      while (scrollTimer.isRunning) {
	scrollTimer.stop();
      }
      var found = false;
      for (var i = 0; i < sourceList.length; i++) {
	if (ateseSources[sourceList[i]].plotMade === false &&
	    isInViewport(dom.byId('source-' + sourceList[i]))) {
	  found = true;
	  makeSourcePlot(sourceList[i]);
	  ateseSources[sourceList[i]].plotMade = true;
	} else if (found) {
	  // We've gone off the end of the page.
	  break;
	}
      }
    };
    
    scrollTimer.onTick = plotCheck;
    var scrollCheck = function(evt) {
      if (scrollTimer.isRunning) {
	scrollTimer.stop();
      }
      scrollTimer.start();
    };

    var countSelected = function() {
      var selectedSources = [];
      for (var src in ateseSources) {
	if (ateseSources.hasOwnProperty(src) && ateseSources[src].selected &&
	    !domClass.contains(ateseSources[src].domNode, 'hidden')) {
	  selectedSources.push(src);
	}
      }
      var selectedCount = selectedSources.length;
      domAttr.set('sources-selected-number', 'innerHTML', selectedCount);
      if (selectedCount > 0) {
	domAttr.set('button-source-data-download', 'disabled', false);
      } else {
	domAttr.set('button-source-data-download', 'disabled', true);
      }
      return selectedSources;
    };
    
    // Get the ATESE catalogue.
    xhr.get("datarelease/datarelease_catalogue.json", {
      'handleAs': "json"
    }).then(function(data) {
      if (typeof(data) !== 'undefined') {
	// Compile the sources.
	ateseSources = data;
	for (var src in data) {
	  if (data.hasOwnProperty(src)) {
	    sourceList.push(src);
	    var sc = skyCoord.new([
	      data[src].rightAscension[0],
	      data[src].declination[0]
	    ]);
	    ateseSources[src].coordinate = sc;
	    ateseSources[src].selected = false;
	    // Add some computed arrays.
	    ateseSources[src].computedFluxDensity = [];
	    ateseSources[src].computedSpectralIndex = [];
	    ateseSources[src].siClassification = [];
	    ateseSources[src].absClosurePhase = ateseSources[src].closurePhase.map(Math.abs);
	    // And some stuff for filling out later.
	    ateseSources[src].spectralData = {};
	    ateseSources[src].specColour = {};
	    ateseSources[src].spectraPlotted = {};
	  }
	}
	sortSources();
	populatePage();
	countSelected();
	
	// Make the node list of all the panels.
	panelList = query(".source-div");
	
	// Attach the scroll event.
	on(window, 'scroll', scrollCheck);
	// And run it straight away.
	scrollCheck(null);
      }
    }, function(err) {
      // Not handling errors.

    }, function(evt) {
      var loadPct = evt.loaded / evt.total * 100;
      var loadKb = evt.loaded / 1024;
      var totalKb = evt.total / 1024;
      domAttr.set('catalogue-loaded-progress', 'innerHTML',
		  number.round(loadKb, 0));
      domAttr.set('catalogue-size-total', 'innerHTML',
		  number.round(totalKb, 0));
      domAttr.set('catalogue-loaded-percent', 'innerHTML',
		  number.round(loadPct, 1));
    });
    
    // A routine to check if the position entered in the
    // reference position input box is valid.
    var positionCheckTimer = new timing.Timer(200); // trigger after 200ms.
    
    var referencePosition = null;
    var positionChecker = function() {
      while (positionCheckTimer.isRunning) {
	positionCheckTimer.stop();
      }
      
      var searchPosition = domAttr.get('input-position-position', 'value');
      var sp = searchPosition.replace(/\s/g, "");
      if (sp == "" || sp.length == 0) {
	// Empty.
	domClass.add('input-position-warning', 'hidden');
	domClass.add('input-position-correct', 'hidden');
	return;
      }
      
      var tempposition = null;
      if ((searchPosition.match(/\,/g) || []).length === 1) {
	var e = searchPosition.split(/\,/);
	for (var i = 0; i < e.length; i++) {
	  e[i] = e[i].replace(/\s+/g, "");
	}
	tempposition = skyCoord.new(e);
      } else {
	var e = searchPosition.split(/\s+/g);
	if (e.length === 6) {
	  var p1 = e[0] + ":" + e[1] + ":" + e[2];
	  var p2 = e[3] + ":" + e[4] + ":" + e[5];
	  tempposition = skyCoord.new([p1, p2]);
	} else if (e.length === 2) {
	  tempposition = skyCoord.new(e);
	}
      }
      if (tempposition !== null) {
	referencePosition = tempposition;
	// Remove the alert icon.
	domClass.add('input-position-warning', 'hidden');
	// Add the correct icon.
	domClass.remove('input-position-correct', 'hidden');
      } else {
	// Uncheck the box.
	referencePosition = null;
	// domAttr.set('selector-position', 'checked', false);
	// Show the alert icon.
	domClass.remove('input-position-warning', 'hidden');
	// Remove the correct icon.
	domClass.add('input-position-correct', 'hidden');
      }
      
    };

    positionCheckTimer.onTick = positionChecker;
    on(dom.byId('input-position-position'), 'keydown', function(evt) {
      if (positionCheckTimer.isRunning) {
	positionCheckTimer.stop();
      }
      positionCheckTimer.start();
    });

      
    // Make the selection button do things.
    on(dom.byId('button-show-sources'), 'click', function(evt) {
      getFlatRange();
      sourceList = [];
      var minEpochs = 1;
      if (domAttr.get('selector-nepochs', 'checked')) {
	minEpochs = domAttr.get('input-nepochs', 'value');
      }
      var maxDefect = 1e6;
      if (domAttr.get('selector-defect', 'checked')) {
	maxDefect = domAttr.get('input-defect', 'value');
      }
      var maxClosurePhase = 1e6;
      if (domAttr.get('selector-closurephase', 'checked')) {
	maxClosurePhase = domAttr.get('input-closurephase', 'value');
      }
      var minFluxDensity = 0;
      if (domAttr.get('selector-fluxdensity', 'checked')) {
	minFluxDensity = domAttr.get('input-fluxdensity', 'value');
      }
      
      var siRequiredConstant = domAttr.get('selector-constant-si', 'checked');
      var siRequiredVariable = domAttr.get('selector-variable-si', 'checked');
      
      var minDeviation = 0;
      if (domAttr.get('selector-fluxdeviation', 'checked')) {
	minDeviation = domAttr.get('input-fluxdeviation', 'value');
      }
      
      var checkPosition = false;
      var searchDistance = parseFloat(domAttr.get('input-position-distance', 'value'));
      if (domAttr.get('selector-position', 'checked') && referencePosition !== null) {
	checkPosition = true;
      }
      
      frequencyEval = parseFloat(domAttr.get('input-fd-frequency', 'value')); // MHz
      
      for (var src in ateseSources) {
	if (ateseSources.hasOwnProperty(src)) {
	  // Do our checks.
	  var includeSource = true;
	  var meas = ateseSources[src];
	  if (meas.epochs.length < minEpochs) {
	    includeSource = false;
	  }
	  
	  if (Math.min.apply(this, meas.defect) > maxDefect) {
	    includeSource = false;
	  }
	  
	  if (Math.min.apply(this, meas.absClosurePhase) > maxClosurePhase) {
	    includeSource = false;
	  }
	  
	  var cminFluxDensity = Math.min.apply(this, meas.computedFluxDensity);
	  var cmaxFluxDensity = Math.max.apply(this, meas.computedFluxDensity);		  
	  if (cmaxFluxDensity < minFluxDensity) {
	    includeSource = false;
	  }
	  
	  var siConstant = meas.siClassification.reduce(function(p, c, x, a) {
	    if (p === c) {
	      if (x === (a.length - 1)) {
		return true;
	      }
	      return p;
	    } else {
	      return false;
	    }
	  });
	  
	  if (siRequiredConstant && !siConstant) {
	    includeSource = false;
	  }
	  
	  if (siRequiredVariable && siConstant) {
	    includeSource = false;
	  }
	  
	  var deviation = Math.max((Math.abs((cminFluxDensity - meas.avgFluxDensity) / meas.avgFluxDensity)),
				   (Math.abs((cmaxFluxDensity - meas.avgFluxDensity) / meas.avgFluxDensity)))
	  if ((deviation * 100) < minDeviation) {
	    includeSource = false;
	  }
	  
	  if (checkPosition) {
	    var dist = referencePosition.distanceTo(meas.coordinate);
	    if (dist.toArcseconds() > searchDistance) {
	      includeSource = false;
	    }
	  }
	  
	  if (includeSource) {
	    sourceList.push(src);
	    domClass.remove(ateseSources[src].domNode, 'hidden');
	  } else {
	    // Hide the DOM node.
	    domClass.add(ateseSources[src].domNode, 'hidden');
	  }
	}
      }
      sortSources();
      scrollCheck();
      showNSources();
      countSelected();
    });

    // Ensure that only one of the spectral index checkboxes can
    // be checked at one time.
    var checkboxChecker = function(evt) {
      if (evt.target.id === 'selector-variable-si') {
	domAttr.set('selector-constant-si', 'checked', false);
      }
      if (evt.target.id === 'selector-constant-si') {
	domAttr.set('selector-variable-si', 'checked', false);
      }
    };
    on(dom.byId('selector-variable-si'), 'change', checkboxChecker);
    on(dom.byId('selector-constant-si'), 'change', checkboxChecker);
      
  });
