require( [ "dojo/dom-construct", "dojo/request/xhr", "dojo/dom", "atnf/skyCoordinate" ],
  function(domConstruct, xhr, dom, skyCoord) {

      // The list of all sources.
      var ateseSources = [];

      var sourceList = [];

      // Sort the sources.
      var sortByRA = function(a, b) {
	  var ara = ateseSources[a].coordinate.toJ2000().rightAscension.toDegrees();
	  var bra = ateseSources[b].coordinate.toJ2000().rightAscension.toDegrees();

	  return (ara - bra);
      };
      
      var sortSources = function() {
	  sourceList.sort(sortByRA);
      };
      
      // Make the page.
      var populatePage = function() {
	  var tl = dom.byId('source-area');
	  for (var i = 0; i < sourceList.length; i++) {
	      var sdiv = domConstruct.create('div', {
		  'id': "source-" + sourceList[i],
		  'class': "source-div"
	      });
	      tl.appendChild(sdiv);
	      var stitle = domConstruct.create('div', {
		  'class': "source-div-title",
		  'innerHTML': sourceList[i].toUpperCase()
	      });
	      sdiv.appendChild(stitle);
	  }
      };

      // Get the ATESE catalogue.
      xhr("datarelease/datarelease_catalogue.json", {
	  'handleAs': "json",
	  'async': true
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
		  }
	      }
	      sortSources();
	      populatePage();
	  }
      });
      
  });
