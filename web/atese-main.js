require( [ "dojo/dom-construct", "dojo/dom", "astrojs/base", "dojo/number", "./atese-common.js",
	   "dojo/on", "dojo/dom-geometry", "dojo/window", "dojo/dom-attr", "dojo/dom-class",
	   "dojo/query", "dojox/timing", "dojo/dom-style", "./atese-plotting.js",
	   "astrojs/useful", "dojo/when", "astrojs/time", "dojo/_base/fx", "dojo/io-query",
	   "dojo/dom-form", "dojo/hash", "dojo/topic", "dojo/_base/lang",
	   "dojo/NodeList-dom",
	   "dojo/domReady!" ],
	 function(domConstruct, dom, astrojs, number, atese, on, domGeom,
		  win, domAttr, domClass, query, timing, domStyle, atesePlot,
		  useful, when, astroTime, fx, ioQuery, domForm, hash, topic, lang) {

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

	   // Get the options set by our form on the page.
	   var pageOptions = domForm.toObject("showForm");
	   // Add to it the hidden default options.
	   var hiddenOptions = domForm.toObject("hiddenForm");
	   atese.mixObj(hiddenOptions, pageOptions);
	   // Make a copy for the default.
	   var defaultPageOptions = lang.clone(pageOptions);
	   // Add to the default options the values to deselect the checkboxes.
	   atese.mixObj({
	     'use-show-nepochs': "no",
	     'use-show-defect': "no",
	     'use-show-closure': "no",
	     'use-show-fluxDensity': "no",
	     'show-variable-spectralIndex': "no",
	     'show-constant-spectralIndex': "no",
	     'use-fluxDensity-deviation': "no",
	     'use-show-position': "no"
	   }, defaultPageOptions, { 'overwrite': false });
	   
	   // Get over-riding options from the address bar.
	   var urlOptions = ioQuery.queryToObject(hash());

	   // Mix these two objects together, overwriting anything in the pageOptions.
	   atese.mixObj(urlOptions, pageOptions);
	   // Mix the hidden options with the URL options, but only take the
	   // appropriately hidden parameters.
	   atese.mixObj(urlOptions, hiddenOptions, { 'onlyDestination': true });
	   // And make sure all appropriate strings are Boolean.
	   atese.checkBools(pageOptions);

	   // Begin by getting the first list of sources so we can start making the page.
	   atese.setSorting(pageOptions.sorting);

	   // The arrays controlling the layout of the measurement tables.
	   var headCells = [ "Epoch", "RA", "Dec", "Flux Density (Jy/beam)",
			     "Spectral Index", "Closure Phase (deg)", "Defect (%)",
			     "Solar Angle" ]
	   var cellIds = [ 'epoch', 'rightAscension', 'declination',
			   'fluxDensity', 'spectralIndex', 'closurePhase', 'defect',
			   'solarAngle' ];

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

	   // Check if the source satisfy our "show" criteria.
	   var evaluationRoutines = {
	     // Number of epochs.
	     'numEpochs': function(srcData) {
	       if (srcData.epochs.length >= pageOptions['show-nepochs']) {
		 return true;
	       }
	       return false;
	     },
	     'defect': function(srcData) {
	       for (var i = 0; i < srcData.defect.length; i++) {
		 if (srcData.defect[i] <= parseFloat(pageOptions['show-defect'])) {
		   return true;
		 }
	       }
	       return false;
	     },
	     'closurePhase': function(srcData) {
	       for (var i = 0; i < srcData.closurePhase.length; i++) {
		 if (Math.abs(srcData.closurePhase[i]) <= parseFloat(pageOptions['show-closure'])) {
		   return true;
		 }
	       }
	       return false;
	     },
	     'fluxDensity': function(srcData) {
	       if (typeof srcData.computedFluxDensity !== "undefined") {
		 for (var i = 0; i < srcData.computedFluxDensity.length; i++) {
		   if (srcData.computedFluxDensity[i] >= parseFloat(pageOptions['show-fluxDensity'])) {
		     return true;
		   }
		 }
		 return false;
	       } else {
		 return true;
	       }
	     },
	     'variableSpectralIndex': function(srcData) {
	       if (typeof srcData.siClassification !== 'undefined') {
		 var c = srcData.siClassification[0];
		 for (var i = 1; i < srcData.siClassification.length; i++) {
		   if (srcData.siClassification[i] !== c) {
		     return true;
		   }
		 }
		 return false;
	       } else {
		 return true;
	       }
	     },
	     'constantSpectralIndex': function(srcData) {
	       if (typeof srcData.siClassification !== 'undefined') {
		 var c = srcData.siClassification[0];
		 for (var i = 1; i < srcData.siClassification.length; i++) {
		   if (srcData.siClassification[i] !== c) {
		     return false;
		   }
		 }
		 return true;
	       } else {
		 return true;
	       }
	     },
	     'fluxDensityDeviation': function(srcData) {
	       if (typeof srcData.computedFluxDensity !== 'undefined') {
		 for (var i = 0; i < srcData.computedFluxDensity.length; i++) {
		   var d = (srcData.computedFluxDensity[i] - srcData.avgFluxDensity) /
		       srcData.avgFluxDensity;
		   if ((d * 100) >= parseFloat(pageOptions['fluxDensity-deviation'])) {
		     return true;
		   }
		 }
		 return false;
	       } else {
		 return true;
	       }
	     }
	   };
	   var showSource = function(src) {
	     // The actual object for the used evaluations.
	     var routines = {};

	     var evaluationOptions = { 'compute': false };
	     if (pageOptions['use-show-nepochs'] === "yes") {
	       routines.numEpochs = evaluationRoutines.numEpochs;
	     }
	     if (pageOptions['use-show-defect'] === "yes") {
	       routines.defect = evaluationRoutines.defect;
	     }
	     if (pageOptions['use-show-closure'] === "yes") {
	       routines.closurePhase = evaluationRoutines.closurePhase;
	     }
	     if (pageOptions['use-show-fluxDensity'] === "yes") {
	       routines.fluxDensity = evaluationRoutines.fluxDensity;
	       evaluationOptions.compute = true;
	     }
	     if (pageOptions['show-variable-spectralIndex'] === "yes") {
	       routines.spectralIndex = evaluationRoutines.variableSpectralIndex;
	       evaluationOptions.compute = true;
	     }
	     if (pageOptions['show-constant-spectralIndex'] === "yes") {
	       routines.spectralIndex = evaluationRoutines.constantSpectralIndex;
	       evaluationOptions.compute = true;
	     }
	     if (pageOptions['use-fluxDensity-deviation'] === "yes") {
	       routines.fluxDensityDeviation = evaluationRoutines.fluxDensityDeviation;
	       evaluationOptions.compute = true;
	     }
	     
	     // Now call the routine in our common library that can evaluate everything.
	     return atese.evaluateConditions(src, routines, evaluationOptions);
	     // We simply return true for now.
	     return true;
	   };
	   
	   var makeSourcePanel = function(src) {
	     // Check that we haven't made the panel before now.
	     if (atese.getSourceProperty(src, "pageElement")) {
	       return;
	     }
	     
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
	     var phdiv = domConstruct.create('div', {
	       'class': "plotholder-div"
	     }, sdiv);
	     var pdiv = domConstruct.create('div', {
	       'id': idMethods.plotId(src),
	       'class': "plot-div"
	     }, phdiv);

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
	       'innerHTML': "&lt;-- previous spectra",
	       'class': "navigation-previous"
	     }, sndiv);
	     on(prevDiv, 'click', showDifferentSpectra);
	     var nextDiv = domConstruct.create('div', {
	       'id': idMethods.nextId(src),
	       'innerHTML': "next spectra --&gt;",
	       'class': "navigation-next"
	     }, sndiv);
	     on(nextDiv, 'click', showDifferentSpectra);
	     
	     var tdiv = domConstruct.create('div', {
	       'id': idMethods.tableId(src),
	       'class': "table-div"
	     }, sdiv);
	     
	     // Create the measurement table.
	     var mTable = domConstruct.create('table', {
	       'class': "source-div-measurements-table"
	     }, tdiv);

	       // Give it a caption for the colour scheme.
	       var mCaption = domConstruct.create('caption', null, tdiv);
	       var mCaptionSpan = domConstruct.create('span', {
		   'class': 'only4cm',
		   'innerHTML': "White rows have 4cm data only"
	       }, mCaption);
	       mCaptionSpan = domConstruct.create('span', {
		   'class': 'only16cm',
		   'innerHTML': "Yellow rows have 16cm data only"
	       }, mCaption);
	       mCaptionSpan = domConstruct.create('span', {
		   'class': 'both4and16cm',
		   'innerHTML': "Blue rows have 4cm and 16cm data"
	       }, mCaption);
	       
	     
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
	     return ((nodePos.x > 0) && (nodePos.x < viewport.w) && (nodePos.y > 0) &&
		     (nodePos.y < (viewport.h * 2)));
	   };

	   
	   // A flag set after the initial page render.
	   var pageStarted = false;
	   // This variable is the number of sources to render at a time.
	   var renderNumber = 30;
	   // This variable is the index of the first source on the page.
	   var renderedIndices = { 'min': -1, 'max': -1 };
	   // This variable gets set to true when we need to put more sources on the page.
	   var renderMore = false;
	   
	   // The reference DOM element.
	   var referenceElement = dom.byId("first-source");
	   // A direction to add new elements.
	   var addDirection = "after";

	   // This routine renders the page.
	   var pageRender = function(sourceList) {
	     // We'll need to know the range of available sources later.
	     var indexRange = atese.getIndexRange();
	     // Put the number of sources available on the page.
	     domAttr.set("nsources-available", "innerHTML", atese.numberSourcesAvailable());
	     domAttr.set("nsources-loaded", "innerHTML", atese.numberSourcesLoaded());
	     
	     if (!pageStarted) {
	       // This is the first time rendering the page, so we do some
	       // special things.
	       // Add a div to the top of the page; when we see it, we'll
	       // ask for more sources before the first displayed one.
	       var moreBefore = domConstruct.create('div', {
		 'class': "sources-needed",
		 'id': "sources-needed-before",
		 'innerHTML': "&nbsp;"
	       }, referenceElement, "after");
	       referenceElement = moreBefore;

	       // Add a div to the bottom of the page; when we see it,
	       // we'll ask for more sources after the last displayed one.
	       var moreAfter = domConstruct.create('div', {
		 'class': "sources-needed",
		 'id': "sources-needed-after",
		 'innerHTML': "&nbsp;"
	       }, referenceElement, "after");

	       pageStarted = true;
	       // Make sure we can render the range we started with.
	       renderedIndices.min = indexRange.min;
	       renderedIndices.max = indexRange.min;
	     };

	     var scrollReference = null;
	     var scrollReferencePosition = null;
	     
	     if (renderMore) {
	       // Go through the source list and add those that are in the
	       // right range, but aren't yet on the page.

	       // Make a list of all the sources that require rendering and that
	       // should be rendered with our current selection.
	       var renderRequired = [];
	       for (var i = indexRange.min; i <= indexRange.max; i++) {
		 if (!atese.getSourceProperty(sourceList[i], "on-page")) {
		   if ((addDirection === "before" &&
			i >= (renderedIndices.min - renderNumber) &&
			i <= renderedIndices.min) ||
		       (addDirection === "after" &&
			i <= (renderedIndices.max + renderNumber) &&
			i >= renderedIndices.max)) {
		     renderRequired.push(i);
		   }
		 }
	       }

	       // Set the reference element.
	       if (addDirection === "after") {
		 // The reference element is the last source on the page.
		 if (atese.getSourceProperty(sourceList[renderedIndices.max], "on-page")) {
		   referenceElement = atese.getSourceProperty(sourceList[renderedIndices.max], "pageElement");
		 }
	       } else {
		 // The reference element is the first source on the page.
		 if (atese.getSourceProperty(sourceList[renderedIndices.min], "on-page")) {
		   referenceElement = atese.getSourceProperty(sourceList[renderedIndices.min], "pageElement");
		   // We also want to scroll back to this node after we add the new nodes.
		   scrollReference = referenceElement;
		   scrollReferencePosition = domGeom.position(scrollReference);
		 }
		 // Reverse the order of the render required array.
		 renderRequired = renderRequired.reverse();
	       }
	       
	       var numRendered = 0;
	       for (var j = 0; j < renderRequired.length; j++) {
		 if (numRendered === renderNumber) {
		   break;
		 }
		 var i = renderRequired[j];
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
		     
		     // We've rendered another source.
		     if (renderedIndices.min === -1 ||
			 i < renderedIndices.min) {
		       renderedIndices.min = i;
		     }
		     if (renderedIndices.max === -1 ||
			 i > renderedIndices.max) {
		       renderedIndices.max = i;
		     }
		     numRendered++;
		   }
		 }
	       }

	       renderMore = false;

	       // Scroll back to a reference node if necessary.
	       if (scrollReference !== null) {
		 win.scrollIntoView(scrollReference);
	       }
	     }

	     // Make plots for those sources that we can currently see in
	     // the viewport.
	     var numberSourcesShown = 0;
	     for (var i = 0; i < sourceList.length; i++) {
	       if (atese.getSourceProperty(sourceList[i], "on-page")) {
		 // The page element is on the DOM.
		 // Check if it should be shown.
		 var pageElement = atese.getSourceProperty(sourceList[i], "pageElement");
		 if (!showSource(sourceList[i])) {
		   // Hide the DOM element.
		   domClass.add(pageElement, "hidden");
		 } else {
		   // Show the DOM element.
		   domClass.remove(pageElement, "hidden");
		   numberSourcesShown++;

		   // And check for its position.
		   if (isInViewport(pageElement)) {
		     // Make sure all the quantities are up to date.
		     atese.computeSource(sourceList[i], pageOptions["fluxDensity-frequency"],
					 pageOptions["spectralIndex-flat-low"],
					 pageOptions["spectralIndex-flat-high"]);

		     if (scrollReference === null) {
		       // This is here to try and make scrolling nicer.
		       var np = domGeom.position(pageElement);
		       if (np.y > 0) {
			 scrollReference = pageElement;
			 scrollReferencePosition = np;
		       }
		     }
		     
		     // Render the plot.
		     if (pageOptions.fluxPlot &&
			 atese.getSourceProperty(sourceList[i], "plotRender-required")) {
		       // Make the plot.
		       atesePlot.fluxDensityTimePlot(sourceList[i]);
		       atese.setSourceProperty(sourceList[i], "plotRender-required", false);
		     } else if (!pageOptions.fluxPlot) {
		       // Hide the plot area.
		       domClass.add(idMethods.plotId(sourceList[i]), "hidden");
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
		       var nEpochs = atese.numEpochs(sourceList[i]);
		       var plotEpochs = parseInt(pageOptions.nSpectraPlotted);
		       
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
		       var endEpoch = startEpoch + plotEpochs;
		       if (endEpoch >= nEpochs) {
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
		       atesePlot.fluxDensitySpectraPlot(sourceList[i], startEpoch, plotEpochs,
							pageOptions.spectralAveraging);
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
	     }
	     domAttr.set("nsources-shown", "innerHTML", numberSourcesShown);
	     
	     // Scroll back to a reference node if necessary.
	     if (scrollReference !== null) {
	       var nPosition = domGeom.position(scrollReference);
	       // Scroll by the difference from the reference position.
	       var dy = nPosition.y - scrollReferencePosition.y;
	       if (Math.abs(dy) > 20) {
		 window.scrollBy(0, dy);
	       }
	     }

	     // Delete our end bits if we have rendered everything in a
	     // particular direction.
	     if (renderedIndices.max === (sourceList.length - 1)) {
	       // No more sources can be gotten at the end.
	       domConstruct.destroy("sources-needed-after");
	     }
	     if (renderedIndices.min === 0) {
	       // No more sources can be gotten at the start.
	       domConstruct.destroy("sources-needed-before");
	     }
	     
	     // Check now if we can see our end bits.
	     if (dom.byId("sources-needed-after") &&
		 isInViewport(dom.byId("sources-needed-after"))) {
	       // Need to do more rendering.
	       addDirection = "after";
	       renderMore = true;
	     } else if (dom.byId("sources-needed-before") &&
			isInViewport(dom.byId("sources-needed-before"))) {
	       // Need to do more rendering.
	       addDirection = "before";
	       renderMore = true;
	     }

	     if (renderMore) {
	       // Check if we have more sources to render.
	       if (addDirection === "after" &&
		   renderedIndices.max === indexRange.max) {
		 // We need to download more sources.
		 var g = atese.getMoreSources("after");
		 if (g) {
		   g.then(handleSourceList);
		 }
	       } else if (addDirection === "before" &&
			  renderedIndices.min === indexRange.min) {
		 // We need to download more sources.
		 var g = atese.getMoreSources("before");
		 if (g) {
		   g.then(handleSourceList);
		 }
	       } else {
		 // Just keep rendering with the stuff we have.
		 pageRender(sourceList);
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

	     // Check whether we need to get more sources from the server.
	     if (dom.byId("sources-needed-after") &&
		 isInViewport(dom.byId("sources-needed-after"))) {
	       // Ask for more sources after the last displayed one.
	       addDirection = "after";
	       renderMore = true;
	     } else if (dom.byId("sources-needed-before") &&
			isInViewport(dom.byId("sources-needed-before"))) {
	       // Ask for more sources before the last displayed one.
	       addDirection = "before";
	       renderMore = true;
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

	   // Handle changes to the options form.
	   on(dom.byId("button-show-sources"), 'click', function(e) {
	     // Get the options set by the form on the page.
	     var formOptions = domForm.toObject("showForm");
	     // Mix in the hidden options.
	     atese.mixObj(hiddenOptions, formOptions);
	     // Turn it into a hash.
	     var nh = ioQuery.objectToQuery(formOptions);
	     // Set it into the address.
	     hash(nh);
	   });
	   
	   // Handle changes to the hash.
	   topic.subscribe("/dojo/hashchange", function(h) {
	     // Turn the new hash into an object.
	     var uh = ioQuery.queryToObject(h);

	     // Keep a copy of the current options.
	     var oldOptions = lang.clone(pageOptions);
	     
	     // Get the default page options again.
	     pageOptions = lang.clone(defaultPageOptions);
	     
	     // Mix the new hash back with the page options.
	     atese.mixObj(uh, pageOptions);
	     atese.checkBools(pageOptions);

	     // Check for conditions that require reloading the page.
	     if (oldOptions.sorting !== pageOptions.sorting ||
		 oldOptions.firstSource !== pageOptions.firstSource ||
		 oldOptions.showSource !== pageOptions.showSource) {
	       window.location.reload(true);
	     } else {
	       // We can handle this change with a page refresh.
	       // Update the form on the page.
	       for (var d in pageOptions) {
		 if (pageOptions.hasOwnProperty(d)) {
		   var a = query('[name="' + d + '"]');
		   if (domAttr.get(a[0], 'type') === "checkbox") {
		     a[0].checked = (pageOptions[d] === "yes");
		   } else {
		     domAttr.set(a[0], 'value', pageOptions[d]);
		   }
		 }
	       }
	       
	       // Do we need to remake any plots or tables?
	       if (oldOptions["fluxDensity-frequency"] !== pageOptions["fluxDensity-frequency"]) {
		 atese.resetAllSourcesProperty("plotRender-required", true);
		 atese.resetAllSourcesProperty("tableFill-required", true);
		 atese.resetAllSourcesProperty("upToDate", false);
	       }
	       if (oldOptions["spectralIndex-flat-low"] !== pageOptions["spectralIndex-flat-low"] ||
		   oldOptions["spectralIndex-flat-high"] !== pageOptions["spectralIndex-flat-high"]) {
		 atese.resetAllSourcesProperty("plotRender-required", true);
		 atese.resetAllSourcesProperty("upToDate", false);
	       }
	       // Refresh the page now.
	       pageChange();
	     }
	   });

	   var scrollHandled = false;
	   
	   // Deal with a source list.
	   var handleSourceList = function(data) {
	     if (typeof data === 'undefined' ||
		 typeof data.data === 'undefined') {
	       // Something went wrong.
	       return;
	     }

	     // We only want to start handling the scroll event when
	     // we have sources on the page.
	     if (!scrollHandled) {
	       // Start handling the scroll event.
	       on(window, 'scroll', scrollCheck);
	       scrollHandled = true;
	     }

	     // Make the panels for each of the sources we
	     // now know about.
	     for (var s in data.data) {
	       if (data.data.hasOwnProperty(s)) {
		 makeSourcePanel(s);
	       }
	     }
	     
	     // Render the page with the new source list.
	     renderMore = true;
	     pageChange();
	     
	   };

	   // Ensure that if one of the spectral index classification
	   // boxes is checked, the other is unchecked.
	   var oneSI = function(evtObj) {
	     var other;
	     if (evtObj.target.id === "selector-variable-si") {
	       other = "selector-constant-si";
	     } else if (evtObj.target.id === "selector-constant-si") {
	       other = "selector-variable-si";
	     }
	     domAttr.set(other, 'checked', false);
	   };
	   on(dom.byId('selector-variable-si'), 'click', oneSI);
	   on(dom.byId('selector-constant-si'), 'click', oneSI);
	   
	   atese.getFirstSources(pageOptions.firstSource).then(handleSourceList);
	   
	 });
