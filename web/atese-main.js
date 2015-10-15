require( [ "dojo/dom-construct", "dojo/dom", "astrojs/base", "dojo/number", "./atese-common.js",
	   "dojo/on", "dojo/dom-geometry", "dojo/window", "dojo/dom-attr", "dojo/dom-class",
	   "dojo/query", "dojox/timing", "dojo/dom-style", "./atese-plotting.js",
	   "astrojs/useful", "dojo/when", "astrojs/time", "dojo/_base/fx",
	   "dojo/NodeList-dom",
	   "dojo/domReady!" ],
	 function(domConstruct, dom, astrojs, number, atese, on, domGeom,
		  win, domAttr, domClass, query, timing, domStyle, atesePlot,
		  useful, when, astroTime, fx) {

	   // Begin by getting the first list of sources so we can start making the page.
	   atese.setSorting("ra");

	   // This object contains methods to generate IDs based on the source name.
	   var idMethods = {
	     'sourceId': function(src) {
	       return "source-" + src;
	     },
	     'plotId': function(src) {
	       return "plot-" + src;
	     },
	     'seriesId': function(src, classification) {
	       return "fluxes-" + classification + "-" + src;
	     },
	     'tableId': function(src) {
	       return "table-" + src;
	     },
	     'measurementsId': function(src) {
	       return "measurements-" + src;
	     },
	     'spectraId': function(src) {
	       return "spectraplot-" + src;
	     },
	     'legendId': function(src) {
	       return "spectraplot-legend-" + src;
	     },
	     'nextId': function(src) {
	       return src + "-next-spectra";
	     },
	     'prevId': function(src) {
	       return src + "-prev-spectra";
	     }
	   };
	   // And set our plotter to use these.
	   atesePlot.setIdGenerator(idMethods);
	   
	   var pageOptions = {
	     'fluxPlot': true,
	     'fluxTable': true,
	     'spectraPlot': true,
	     'fluxDensityFrequency': 4500,
	     'siFlatLowValue': -0.2,
	     'siFlatHighValue': 0.2,
	     'nSpectraPlotted': 5
	   };

	   // The arrays controlling the layout of the measurement tables.
	   var headCells = [ "MJD", "Epoch", "RA", "Dec", "Flux Density (Jy/beam)",
			     "Spectral Index", "Closure Phase (deg)", "Defect (%)" ]
	   var cellIds = [ 'mjd', 'epoch', 'rightAscension', 'declination',
			   'fluxDensity', 'spectralIndex', 'closurePhase', 'defect' ];

	   var showDifferentSpectra = function(e) {
	     // Which element was clicked on?
	     var eId = e.target.id;

	     // Does the user want to go backwards or forwards.
	     var repString = "";
	     var epochDelta = (pageOptions.nSpectraPlotted - 1);
	     if (/-prev-spectra$/.test(eId)) {
	       // Go backwards.
	       repString = "-prev-spectra";
	       epochDelta *= -1;
	     } else if (/-next-spectra$/.test(eId)) {
	       // Go forwards.
	       repString = "-next-spectra";
	     }

	     // Determine the source name.
	     var src = eId.replace(repString, "");
	     console.log(src);

	     // Get the current spectra display settings.
	     var plottedSet = atese.getSourceProperty(src, "spectraSet");

	     // Ask for earlier spectra.
	     plottedSet.startEpoch += epochDelta;

	     // Save these settings.
	     atese.setSourceProperty(src, "spectraSet", plottedSet);

	     // Mark this as requiring an update.
	     atese.setSourceProperty(src, "plotSpectra-required", true);

	     // Call the page renderer.
	     pageChange();
	     
	   };
	   
	   var makeSourcePanel = function(src) {
	     // Make the container div.
	     var sdiv = domConstruct.create('div', {
	       'id': idMethods.sourceId(src),
	       'class': "source-div"
	     });

	     var nEpochs = atese.numEpochs(src);

	     // The title is the RA and Dec of the source, along with the number
	     // of epochs that it has been observed in.
	     // Get the sky coordinate.
	     var sc = atese.getSourceProperty(src, "coordinate");
	     var ra = astrojs.turns2hexa(sc.toJ2000().rightAscension.toTurns(), {
	       'units': "hours", 'precision': 1, 'alwaysSigned': false
	     });
	     var dec = astrojs.turns2hexa(sc.toJ2000().declination.toTurns(), {
	       'units': "degrees", 'precision': 1, 'alwaysSigned': true
	     });
	     
	     var titleText = src.toUpperCase() + " ( " + ra + " " + dec + " ) [ " +
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

	     // Prepare areas for the data.
	     if (pageOptions.fluxPlot) {
	       var phdiv = domConstruct.create('div', {
		 'class': "plotholder-div"
	       }, sdiv);
	       var pdiv = domConstruct.create('div', {
		 'id': idMethods.plotId(src),
		 'class': "plot-div"
	       }, phdiv);
	     }

	     if (pageOptions.spectraPlot) {
	       var shdiv = domConstruct.create('div', {
		 'class': "plotholder-div"
	       }, sdiv);
	       var spdiv = domConstruct.create('div', {
		 'id': idMethods.spectraId(src),
		 'class': "plot-div"
	       }, shdiv);
	       var sldiv = domConstruct.create('div', {
		 'id': idMethods.legendId(src),
		 'class': "plot-legend-div"
	       }, shdiv);
	       var sndiv = domConstruct.create('div', {
		 'class': "plot-navigation-div"
	       }, shdiv);
	       var prevDiv = domConstruct.create('div', {
		 'id': idMethods.prevId(src),
		 'innerHTML': "&lt; previous spectra",
		 'class': "navigation-previous"
	       }, sndiv);
	       on(prevDiv, 'click', showDifferentSpectra);
	       var nextDiv = domConstruct.create('div', {
		 'id': idMethods.nextId(src),
		 'innerHTML': "next spectra &gt;",
		 'class': "navigation-next"
	       }, sndiv);
	       on(nextDiv, 'click', showDifferentSpectra);
	     }
	     
	     if (pageOptions.fluxTable) {
	       var tdiv = domConstruct.create('div', {
		 'id': idMethods.tableId(src),
		 'class': "table-div"
	       }, sdiv);

	       // Create the measurement table.
	       var mTable = domConstruct.create('table', {
		 'class': "source-div-measurements-table"
	       }, tdiv);

	       // Give it a header.
	       var mHead = domConstruct.create('thead', null, mTable);
	       var mHeadRow = domConstruct.create('tr', null, mHead);

	       for (var i = 0; i < headCells.length; i++) {
		 var mhCell = domConstruct.create('td', {
		   'innerHTML': headCells[i]
		 }, mHeadRow);
	       }

	       // And the unpopulated body.
	       var mBody = domConstruct.create('tbody', {
		 'id': idMethods.measurementsId(src)
	       }, mTable);
	       atese.addSourceProperty(src, "tableBody", mBody);
	     }

	     // The clearing div.
	     var cdiv = domConstruct.create('div', {
	       'class': "clear-div"
	     }, sdiv);
	     
	     atese.addSourceProperty(src, "pageElement", sdiv);
	   };
	   


	   // Determine if an element is in the viewport.
	   var isInViewport = function(node) {
	     // Check if we're hidden.
	     if (domClass.contains(node, 'hidden')) {
	       return false;
	     }
	     var nodePos = domGeom.position(node);;
	     var viewport = win.getBox();
	     return ((nodePos.x > 0) && (nodePos.x < viewport.w) && (nodePos.y > (-1 * viewport.h)) &&
		     (nodePos.y < (viewport.h * 2)));
	   };

	   
	   // A flag set after the initial page render.
	   var pageStarted = false;
	   // This variable is the number of sources to render at a time.
	   var renderNumber = 30;
	   // This variable is the index of the first source on the page.
	   var renderIndex = 0;

	   // The reference DOM element.
	   var referenceElement = dom.byId("first-source");
	   // A direction to add new elements.
	   var addDirection = "after";

	   // This routine renders the page.
	   var pageRender = function(sourceList) {
	     if (!pageStarted) {
	       // This is the first time rendering the page, so we do some
	       // special things.

	       pageStarted = true;
	     };

	     // Go through the source list and add those that are in the
	     // right range, but aren't yet on the page.
	     for (var i = renderIndex; i < renderIndex + renderNumber; i++) {
	       if (!atese.getSourceProperty(sourceList[i], "on-page")) {
		 // We need to add this source to the page.
		 var srcPanel = atese.getSourceProperty(sourceList[i], "pageElement");
		 if (srcPanel) {
		   domConstruct.place(srcPanel, referenceElement, addDirection);
		   referenceElement = srcPanel;
		   atese.setSourceProperty(sourceList[i], "on-page", true);
		   // Indicate that the source needs its flux density vs time plot made.
		   atese.setSourceProperty(sourceList[i], "plotRender-required", true);
		   // Indicate that the source needs its measurement table filled.
		   atese.setSourceProperty(sourceList[i], "tableFill-required", true);
		   // Indicate that the source needs its spectra plot made.
		   atese.setSourceProperty(sourceList[i], "plotSpectra-required", true);
		 }
	       }
	     }

	     // Make plots for those sources that we can currently see in
	     // the viewport.
	     for (var i = 0; i < sourceList.length; i++) {
	       if (atese.getSourceProperty(sourceList[i], "on-page")) {
		 // The page element is on the DOM.
		 // So we check for its position.
		 if (isInViewport(atese.getSourceProperty(sourceList[i], "pageElement"))) {
		   // Make sure all the quantities are up to date.
		   atese.computeSource(sourceList[i], pageOptions.fluxDensityFrequency,
				       pageOptions.siFlatLowValue,
				       pageOptions.siFlatHighValue);
		   
		   // Render the plot.
		   if (pageOptions.fluxPlot &&
		       atese.getSourceProperty(sourceList[i], "plotRender-required")) {
		     atesePlot.fluxDensityTimePlot(sourceList[i]);
		     atese.setSourceProperty(sourceList[i], "plotRender-required", false);
		   }
		   // Fill the table.
		   if (pageOptions.fluxTable &&
		       atese.getSourceProperty(sourceList[i], "tableFill-required")) {
		     atesePlot.fluxDensityTableFill(sourceList[i], cellIds);
		     atese.setSourceProperty(sourceList[i], "tableFill-required", false);
		   }
		   // Show the spectra.
		   if (pageOptions.spectraPlot &&
		       atese.getSourceProperty(sourceList[i], "plotSpectra-required")) {
		     console.log("preparing to plot spectra for " + sourceList[i]);
		     var nEpochs = atese.numEpochs(sourceList[i]);
		     var plotEpochs = pageOptions.nSpectraPlotted;

		     // Look for a set of already plotted epochs.
		     var plottedSet = atese.getSourceProperty(sourceList[i], "spectraSet");
		     var startEpoch;
		     if (typeof plottedSet === 'undefined') {
		       // We haven't made a plot yet, so we choose the latest epochs.
		       startEpoch = nEpochs - plotEpochs;
		       plottedSet = {
			 'startEpoch': startEpoch
		       };
		     } else {
		       // We just use what we've got.
		       startEpoch = plottedSet.startEpoch;
		     }

		     // Do some consistency checks.
		     if ((startEpoch + plotEpochs) >= nEpochs) {
		       startEpoch = nEpochs - plotEpochs;
		     }
		     if (startEpoch < 0) {
		       startEpoch = 0;
		     }
		     if (nEpochs < plotEpochs) {
		       plotEpochs = nEpochs;
		     }
		     plottedSet.startEpoch = startEpoch;
		     plottedSet.plotEpochs = plotEpochs;
		     atese.setSourceProperty(sourceList[i], "spectraSet", plottedSet);
		     atesePlot.fluxDensitySpectraPlot(sourceList[i], startEpoch, plotEpochs);
		     atese.setSourceProperty(sourceList[i], "plotSpectra-required", false);

		     // Update the status of the previous/next links.
		     if (startEpoch === 0) {
		       // Hide the previous link.
		       domClass.add(idMethods.prevId(sourceList[i]), "hidden");
		     } else {
		       domClass.remove(idMethods.prevId(sourceList[i]), "hidden");
		     }
		     if ((startEpoch + plotEpochs) >= nEpochs) {
		       // Hide the next link.
		       domClass.add(idMethods.nextId(sourceList[i]), "hidden");
		     } else {
		       domClass.remove(idMethods.nextId(sourceList[i]), "hidden");
		     }
		   }
		 }
	       }
	     }
	     
	   };

	   // We want to make plots only when the user has just finished scrolling,
	   // so the page always appears responsive.
	   var scrollTimer = new timing.Timer(400); // trigger after 400ms.
	   
	   // This routine gets called when the page may need to be
	   // re-rendered.
	   var pageChange = function() {
	     // Stop the scroll timer.
	     while (scrollTimer.isRunning) {
	       scrollTimer.stop();
	     }
	     
	     // Get the list of sources in the right order and give it to
	     // the rendering function.
	     when(atese.getSourceList(), pageRender);

	   };
	   scrollTimer.onTick = pageChange;

	   // Handle the scroll event.
	   var scrollCheck = function(evt) {
	     if (scrollTimer.isRunning) {
	       scrollTimer.stop();
	     }
	     scrollTimer.start();
	   };
	   
	   atese.getFirstSources().then(function(data) {
	     // Start handling the scroll event.
	     on(window, 'scroll', scrollCheck);
	     
	     for (var s in data.data) {
	       if (data.data.hasOwnProperty(s)) {
		 makeSourcePanel(s);
	       }
	     }
	     pageChange();
	   });
	   
	 });
