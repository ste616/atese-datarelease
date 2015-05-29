require( [ "dojo/dom-construct", "dojo/request/xhr", "dojo/dom", "astrojs/skyCoordinate",
	   "astrojs/base", "dojo/number", "dojox/charting/Chart", "dojox/charting/SimpleTheme",
	   "dojo/on", "dojo/dom-geometry", "dojo/window", "dojo/dom-attr", "dojo/dom-class",
	   "dojo/query", "dojox/timing", "dojox/charting/themes/PrimaryColors",
	   "dojox/charting/plot2d/Scatter", "dojox/charting/plot2d/Markers",
	   "dojox/charting/plot2d/Lines", "dojox/charting/plot2d/Default",
	   "dojox/charting/axis2d/Default", "dojo/NodeList-dom", "dojox/charting/plot2d/Areas",
	   "dojo/domReady!" ],
  function(domConstruct, xhr, dom, skyCoord, astrojs, number, Chart, SimpleTheme, on, domGeom,
	   win, domAttr, domClass, query, timing, theme) {
    
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
      function(o, i) { return o.closurePhase[i]; },
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
	'innerHTML': titleText
      }, sdiv);
      
      // Make the div for the plots.
      var phdiv = domConstruct.create('div', {
	'class': "plotholder-div"
      }, sdiv);
      var pdiv = domConstruct.create('div', {
	'id': 'plot-' + src,
	'class': "plot-div"
      }, phdiv);
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

      // The link to plot the spectra.
      var speclink = domConstruct.create('span', {
	'id': 'spectralink-' + src,
	'class': "spectra-link",
	'innerHTML': "Plot Spectra"
      }, cdiv);
      // Connect it to its handler.
      on(speclink, 'click', handleSpectraPlot);
      
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
	'minorLabels': false,
	'natural': false
      });
      schart.addAxis('y', {
	'titleOrientation': 'axis',
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
	// Form the file name.
	var efname = ateseSources[src].epochs[i] + "/" +
	    src + "_" + ateseSources[src].epochs[i] + ".json";
	// Grab the file.
	xhr.get("datarelease/" + efname, {
	  'handleAs': "json"
	}).then(plotAddSpectrum);
      }
    };

    var plotAddSpectrum = function(data) {
      if (typeof data === 'undefined') {
	return;
      }
      // Get the plot.
      var src = data.source;
      var schart = ateseSources[src].spectralPlot;

      // Format the Stokes I data.
      var sdata = [];
      for (var i = 0; i < data.fluxDensityData.length; i++) {
	if (data.fluxDensityData[i].stokes === "I") {
	  sdata = data.fluxDensityData[i].data.map(function(a) {
	    return { 'x': a[0], 'y': a[1] };
	  });
	}
      }
      if (sdata.length > 0) {
	schart.addSeries(data.epochName, sdata);
      }
      schart.render();

      // Show the plot.
      domClass.remove('spectraplot-' + src, 'hidden');
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
	var mRow = domConstruct.create('tr', null, mBody);
	for (var j = 0; j < headCells.length; j++) {
	  var mCell = domConstruct.create('td', {
	    'innerHTML': cellProcess[j](meas, sind[i])
	  }, mRow);
	}
      }

    };
      
    // Make the page.
    var populatePage = function() {
      var tl = dom.byId('source-area');
      domConstruct.empty(tl);
      for (var i = 0; i < sourceList.length; i++) {
	// Make the source panel and put it on the page.
	var sdiv = makeSourcePanel(sourceList[i]);
	tl.appendChild(sdiv);
	
	populateMeasurements(sourceList[i]);
	ateseSources[sourceList[i]].plotMade = false;
	
	// Calculate the average flux density for the source.
	ateseSources[sourceList[i]].avgFluxDensity =
	  averageArray.apply(this, ateseSources[sourceList[i]].computedFluxDensity);
	
      }
      
      // Display the number of sources we are showing.
      domAttr.set('nsources-selected', 'innerHTML', sourceList.length);
    };
    
    // Determine if an element is in the viewport.
    var isInViewport = function(node) {
      var nodePos = domGeom.position(node);;
      var viewport = win.getBox();
      return ((nodePos.x > 0) && (nodePos.x < viewport.w) && (nodePos.y > (-1 * viewport.h)) && (nodePos.y < (viewport.h * 2)));
    };
    
    // We want to make plots only when the user has just finished scrolling,
    // so the page always appears responsive.
    var scrollTimer = new timing.Timer(400); // trigger after 200ms.
    
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
	    // Add some computed arrays.
	    ateseSources[src].computedFluxDensity = [];
	    ateseSources[src].computedSpectralIndex = [];
	    ateseSources[src].siClassification = [];
	    ateseSources[src].absClosurePhase = ateseSources[src].closurePhase.map(Math.abs);
	  }
	}
	sortSources();
	populatePage();
	
	// Make the node list of all the panels.
	panelList = query(".source-div");
	
	// Attach the scroll event.
	on(window, 'scroll', scrollCheck);
	// And run it straight away.
	scrollCheck(null);
      }
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
	  }
	}
      }
      sortSources();
      populatePage();
      scrollCheck();
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
