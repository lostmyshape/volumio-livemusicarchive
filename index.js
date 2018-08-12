'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var spawn = require('child_process').spawn;
//var exec = require('child_process').exec;
//var execSync = require('child_process').execSync;
//var unirest = require('unirest');

var lmaApiBaseUrl = 'https://archive.org/advancedsearch.php?';


module.exports = ControllerLiveMusicArchive;
function ControllerLiveMusicArchive(context) {
	var self = this;

	this.context = context;
	this.commandRouter = this.context.coreCommand;
	this.logger = this.context.logger;
	this.configManager = this.context.configManager;

	self.resetHistory();
}

ControllerLiveMusicArchive.prototype.resetHistory = function() {
  var self = this;

  self.uriHistory = [];
  self.historyIndex = -1;
}

ControllerLiveMusicArchive.prototype.historyAdd = function(uri) {
  var self = this;

  // If the new url is equal to the previous one
  // this means it's a "Back" action
  if (self.uriHistory[self.historyIndex - 1] == uri) {
    self.historyPop();
  } else {
    self.uriHistory.push(uri);
    self.historyIndex++;
  }
}

ControllerLiveMusicArchive.prototype.historyPop = function(uri) {
  var self = this;

  self.uriHistory.pop();
  self.historyIndex--;
}

ControllerLiveMusicArchive.prototype.getPrevUri = function() {
  var self = this;
  var uri;

  if (self.historyIndex >= 0) {
    uri = self.uriHistory[self.historyIndex - 1];
  } else {
    uri = 'livemusicarchive';
  }

  return uri;
}



ControllerLiveMusicArchive.prototype.onVolumioStart = function()
{
	var self = this;
	var configFile=this.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
	this.config = new (require('v-conf'))();
	this.config.loadFile(configFile);

  return libQ.resolve();
}

ControllerLiveMusicArchive.prototype.onStart = function() {
	var self = this;
	self.addToBrowseSources();

	self.mpdPlugin = this.commandRouter.pluginManager.getPlugin('music_service', 'mpd');
	self.serviceName = "volumio-livemusicarchive";
	self.loadLiveMusicArchiveI18nStrings();

  return libQ.resolve();
};

ControllerLiveMusicArchive.prototype.onStop = function() {
	return libQ.resolve();
};

ControllerLiveMusicArchive.prototype.onRestart = function() {
	var self = this;
  // Optional, use if you need it
	return libQ.resolve();
};


// Configuration Methods -----------------------------------------------------------------------------

ControllerLiveMusicArchive.prototype.getUIConfig = function() {
  var defer = libQ.defer();
  var self = this;

  var lang_code = this.commandRouter.sharedVars.get('language_code');

  self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
      __dirname+'/i18n/strings_en.json',
      __dirname + '/UIConfig.json')
      .then(function(uiconf)
      {


          defer.resolve(uiconf);
      })
      .fail(function()
      {
          defer.reject(new Error());
      });

  return defer.promise;
};

ControllerLiveMusicArchive.prototype.getConfigurationFiles = function() {
	return ['config.json'];
}

ControllerLiveMusicArchive.prototype.setUIConfig = function(data) {
	var self = this;
	//Perform your installation tasks here
};

ControllerLiveMusicArchive.prototype.getConf = function(varName) {
	var self = this;
	//Perform your installation tasks here
};

ControllerLiveMusicArchive.prototype.setConf = function(varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};



// Playback Controls ---------------------------------------------------------------------------------------
// If your plugin is not a music_sevice don't use this part and delete it


ControllerLiveMusicArchive.prototype.addToBrowseSources = function () {
	var self = this;
	self.commandRouter.volumioAddToBrowseSources({
			name: 'Live Music Archive',
			uri: 'livemusicarchive',
			plugin_type: 'music_service',
			plugin_name: 'volumio-livemusicarchive',
			albumart: '/albumart?sourceicon=music_service/volumio-livemusicarchive/livemusicarchive.svg'
	});
};

ControllerLiveMusicArchive.prototype.handleBrowseUri = function (curUri) {
  var self = this;
  var response;

	self.logger.info("CURURI: "+curUri);

	if (curUri.startsWith('livemusicarchive')) {
		if (curUri == 'livemusicarchive') {
			//Possibly list "All Artists" then a favorites list here instead of all artists
			self.resetHistory();
			self.historyAdd(curUri);
			//List band collections as root menu
			response = self.listCollections();

		}
		else if (curUri.startsWith('livemusicarchive/collection')) {
			//Not currently used -- all artist list if root is favorites
			if (curUri == 'livemusicarchive/collections') {
				self.historyAdd(curUri);
				response = self.listCollections();
			}
			else {
				//list years that have show recordings
				self.historyAdd(curUri);
				response = self.listYears(curUri);
			}
		}
		else if (curUri.startsWith('livemusicarchive/year')) {
			//list shows from collection from year
			self.historyAdd(curUri);
			response = self.listDates(curUri);
		}
		else if (curUri.startsWith('livemusicarchive/date')) {
			//list sources for recordings on this dateUri
			self.historyAdd(curUri);
			response = self.listSources(curUri);
		}

	}


  return response;
};

ControllerLiveMusicArchive.prototype.listCollections = function () {
	var self = this;
	var defer = libQ.defer();

	self.commandRouter.pushToastMessage('info', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('RETREIVING') + ' ' + self.getLiveMusicArchiveinI18nString('ARTISTS') + '. ' + self.getLiveMusicArchiveinI18nString('TAKE_AWHILE'));

//real uri:
//	var uri = lmaApiBaseUrl + 'q=mediatype%3Acollection+AND+collection%3Aetree+AND+format%3AArchive+Bittorrent&fl=identifier,title&rows=10000&page=1&output=json';
//testing uri::
	var uri = lmaApiBaseUrl + 'q=mediatype%3Acollection+AND+collection%3Aetree+AND+format%3AArchive+Bittorrent&fl=identifier,title&rows=100&page=1&output=json';
	var reqCommand = "/usr/bin/curl -X GET '"+uri+"' | /usr/bin/jq -c '.response.docs';";

	var response = {
		"navigation": {
			"lists": [
				{
					"availableListViews":["list","grid"],
					"items":[]
				}
			],
			"prev":{
				"uri":self.getPrevUri()
			}
		}
	};

	var reqProcess = spawn('/bin/sh', ['-c', reqCommand]);
	var resultStr = '';

	reqProcess.stdout.on('data', (data) => {
		resultStr += data.toString();
	});

	reqProcess.on('error', (err) => {
		self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
		self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive:Request for Collection list failed with error: '+err);
		self.historyPop();
		defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
	});

	reqProcess.stderr.on('end', (data) => {
		if (data){
			self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
			self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive:Command for Collection list failed with stderr: '+data);
			self.historyPop();
			defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
		}
	});

	reqProcess.stdout.on('end', (data) => {
		var resultJSON = JSON.parse(resultStr);
		for (var i = 0; i < resultJSON.length; i++) {
			var bandName = resultJSON[i].title;
			var collectionUri = 'livemusicarchive/collection/' + resultJSON[i].identifier;
			var collectionFolder = {
				"service": self.serviceName,
				"type": "item-no-menu",
				"title": bandName,
				"icon": "fa fa-music",
				"uri": collectionUri,
				"sortKey": bandName.replace(/^(?:A|The) /i, '')
			};
			response.navigation.lists[0].items.push(collectionFolder);
		}

		response.navigation.lists[0].items.sort(self.compareSortKey);

		defer.resolve(response);
	});

	return defer.promise;
}

ControllerLiveMusicArchive.prototype.listYears = function (curUri) {
	var self = this;
	var defer = libQ.defer();
	var identifier = self.sanatizeForBash(curUri.split('/')[2]);

	var uri = lmaApiBaseUrl + 'q=collection%3A'+identifier+'&fl=creator,year&rows=10000&page=1&output=json';
	var reqCommand = "/usr/bin/curl -X GET '"+uri+"' | /usr/bin/jq -c '.response.docs | unique_by(.year)';";

	var response = {
		"navigation": {
			"lists": [],
			"prev":{
				"uri":self.getPrevUri()
			}
		}
	};

	var reqProcess = spawn('/bin/sh', ['-c', reqCommand]);
	var resultStr = '';

	reqProcess.stdout.on('data', (data) => {
		resultStr += data.toString();
	});

	reqProcess.on('error', (err) => {
		self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
		self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive:Request for Collection->Year list failed with error: '+err);
		self.historyPop();
		defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
	});

	reqProcess.stderr.on('end', (data) => {
		if (data){
			self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
			self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive:Command for Collection->Year list failed with stderr: '+data);
			self.historyPop();
			defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
		}
	});

	reqProcess.stdout.on('end', (data) => {
		var resultJSON = JSON.parse(resultStr);
		response.navigation.lists.push({
			"type":"title",
			"title":"Years with "+resultJSON[0].creator+" shows:",
			"availableListViews": ["list"],
			"items":[]
		});
		for (var i = 0; i < resultJSON.length; i++) {
			var year = resultJSON[i].year;
			var yearUri = 'livemusicarchive/year/'+identifier+'/'+year;
			var yearFolder = {
				"service": self.serviceName,
				"type": "item-no-menu",
				"title": year,
				"artist": "",
				"album": "",
				"icon": "fa fa-calendar",
				"uri": yearUri,
				"sortKey": year
			};
			response.navigation.lists[0].items.push(yearFolder);
		}
		response.navigation.lists[0].items.sort(self.compareSortKey);

		defer.resolve(response);
	});

	return defer.promise;
}

ControllerLiveMusicArchive.prototype.listDates = function (curUri) {
	var self = this;
	var defer = libQ.defer();
	var identifier = self.sanatizeForBash(curUri.split('/')[2]);
	var yearQ = self.sanatizeForBash(curUri.split('/')[3]);

	var uri = lmaApiBaseUrl + 'q=collection%3A'+identifier+'+AND+year%3A'+yearQ+'&fl=creator,date,coverage,venue&rows=10000&page=1&output=json';
	var reqCommand = "/usr/bin/curl -X GET '"+uri+"' | /usr/bin/jq -c '.response.docs | unique_by(.date)';";

	var response = {
		"navigation": {
			"lists": [],
			"prev":{
				"uri":self.getPrevUri()
			}
		}
	};

	var reqProcess = spawn('/bin/sh', ['-c', reqCommand]);
	var resultStr = '';

	reqProcess.stdout.on('data', (data) => {
		resultStr += data.toString();
	});

	reqProcess.on('error', (err) => {
		self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
		self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive:Request for Collection->Year list failed with error: '+err);
		self.historyPop();
		defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
	});

	reqProcess.stderr.on('end', (data) => {
		if (data){
			self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
			self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive:Command for Collection->Year list failed with stderr: '+data);
			self.historyPop();
			defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
		}
	});

	reqProcess.stdout.on('end', (data) => {
		var resultJSON = JSON.parse(resultStr);
		response.navigation.lists.push({
			"type":"title",
			"title":resultJSON[0].creator+" shows in "+yearQ+":",
			"availableListViews": ["list"],
			"items":[]
		});
		for (var i = 0; i < resultJSON.length; i++) {
			var showVenue = resultJSON[i].venue;
			var showCity  = resultJSON[i].coverage;
			var date = resultJSON[i].date;
			date = date.substring(0, date.indexOf('T') != -1 ? date.indexOf('T') : date.length);
			var d = date.split('-');
			var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
			var showDate = months[d[1]-1] + ' ' + parseInt(d[2],10) + ', ' + d[0];
			var compactDate = date.replace(/-/g,'');
			var dateUri = 'livemusicarchive/date/'+identifier+'/'+compactDate;
			var dateFolder = {
				"service": self.serviceName,
				"type": "item-no-menu",
				"title": showDate + (showVenue ? ' ' + showVenue : '') + (showCity ? ', ' + showCity : ''),
				"artist": resultJSON[i].creator,
				"album": "",
				"icon": "fa fa-calendar",
				"uri": dateUri,
				"sortKey": new Date(d[0],d[1]-1,d[2])
			};
			response.navigation.lists[0].items.push(dateFolder);
		}
		response.navigation.lists[0].items.sort(self.compareSortKey);

		defer.resolve(response);
	});

	return defer.promise;
}

ControllerLiveMusicArchive.prototype.listSources = function (curUri) {
	var self = this;
	var defer = libQ.defer();
	var identifier = self.sanatizeForBash(curUri.split('/')[2]);
	var dateQ = self.sanatizeForBash(curUri.split('/')[3]);
	dateQ = [dateQ.slice(0,4),dateQ.slice(4,6),dateQ.slice(6)].join('-')+'T00:00:00Z';

	var uri = lmaApiBaseUrl + 'q=collection%3A'+identifier+'+AND+date%3A'+dateQ+'&fl=creator,identifier,source,date,coverage,venue&rows=10000&page=1&output=json';
	var reqCommand = "/usr/bin/curl -X GET '"+uri+"' | /usr/bin/jq -c '.response';";

	var response = {
		"navigation": {
			"lists": [],
			"prev":{
				"uri":self.getPrevUri()
			}
		}
	};

	var reqProcess = spawn('/bin/sh', ['-c', reqCommand]);
	var resultStr = '';

	reqProcess.stdout.on('data', (data) => {
		resultStr += data.toString();
	});

	reqProcess.on('error', (err) => {
		self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
		self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive:Request for Collection->Year list failed with error: '+err);
		self.historyPop();
		defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
	});

	reqProcess.stderr.on('end', (data) => {
		if (data){
			self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
			self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive:Command for Collection->Year list failed with stderr: '+data);
			self.historyPop();
			defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
		}
	});

	reqProcess.stdout.on('end', (data) => {
		var resultJSON = JSON.parse(resultStr);
		var d = curUri.split('/')[3];
		d = [d.slice(0,4),d.slice(4,6),d.slice(6)];
		var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
		var showDate = months[d[1]-1] + ' ' + parseInt(d[2],10) + ', ' + d[0];
		response.navigation.lists.push({
			"type":"title",
			"title":resultJSON.numFound+" source"+(resultJSON.numFound==1 ? "" : "s")+" for "+resultJSON.docs[0].creator+" on "+showDate+":",
			"availableListViews": ["list"],
			"items":[]
		});
		for (var i = 0; i < resultJSON.docs.length; i++) {
			var showVenue = resultJSON.docs[i].venue;
			var showCity  = resultJSON.docs[i].coverage;
			var sourceFolder = {
				"service": self.serviceName,
				"type": "folder",
				"title": resultJSON.docs[i].source ? resultJSON.docs[i].source : "No source information",
				"artist": resultJSON.docs[i].creator,
				"album": showDate + (showVenue ? ' ' + showVenue : '') + (showCity ? ', ' + showCity : ''),
				"icon": "fa fa-calendar",
				"uri": "livemusicarchive/source/"+resultJSON.docs[i].identifier
			};
			response.navigation.lists[0].items.push(sourceFolder);
		}

		defer.resolve(response);
	});

	return defer.promise;
}



// Define a method to clear, add, and play an array of tracks
ControllerLiveMusicArchive.prototype.clearAddPlayTrack = function(track) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive::clearAddPlayTrack');

	self.commandRouter.logger.info(JSON.stringify(track));

	return self.sendSpopCommand('uplay', [track.uri]);
};

ControllerLiveMusicArchive.prototype.seek = function (timepos) {
    this.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive::seek to ' + timepos);

    return this.sendSpopCommand('seek '+timepos, []);
};

// Stop
ControllerLiveMusicArchive.prototype.stop = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive::stop');


};

// Spop pause
ControllerLiveMusicArchive.prototype.pause = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive::pause');


};

// Get state
ControllerLiveMusicArchive.prototype.getState = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive::getState');


};

//Parse state
ControllerLiveMusicArchive.prototype.parseState = function(sState) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive::parseState');

	//Use this method to parse the state and eventually send it with the following function
};

// Announce updated State
ControllerLiveMusicArchive.prototype.pushState = function(state) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerLiveMusicArchive::pushState');

	return self.commandRouter.servicePushState(state, self.servicename);
};


ControllerLiveMusicArchive.prototype.explodeUri = function(uri) {
	var self = this;
	var defer=libQ.defer();

	// Mandatory: retrieve all info for a given URI

	return defer.promise;
};

ControllerLiveMusicArchive.prototype.getAlbumArt = function (data, path) {

	var artist, album;

	if (data != undefined && data.path != undefined) {
		path = data.path;
	}

	var web;

	if (data != undefined && data.artist != undefined) {
		artist = data.artist;
		if (data.album != undefined)
			album = data.album;
		else album = data.artist;

		web = '?web=' + nodetools.urlEncode(artist) + '/' + nodetools.urlEncode(album) + '/large'
	}

	var url = '/albumart';

	if (web != undefined)
		url = url + web;

	if (web != undefined && path != undefined)
		url = url + '&';
	else if (path != undefined)
		url = url + '?';

	if (path != undefined)
		url = url + 'path=' + nodetools.urlEncode(path);

	return url;
};





ControllerLiveMusicArchive.prototype.search = function (query) {
	var self=this;
	var defer=libQ.defer();

	// Mandatory, search. You can divide the search in sections using following functions

	return defer.promise;
};

ControllerLiveMusicArchive.prototype._searchArtists = function (results) {

};

ControllerLiveMusicArchive.prototype._searchAlbums = function (results) {

};

ControllerLiveMusicArchive.prototype._searchPlaylists = function (results) {


};

ControllerLiveMusicArchive.prototype._searchTracks = function (results) {

};

ControllerLiveMusicArchive.prototype.loadLiveMusicArchiveI18nStrings = function () {
  var self=this;

  try {
    var language_code = this.commandRouter.sharedVars.get('language_code');
    self.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_'+language_code+".json");
  } catch(e) {
    self.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
  }

  self.i18nStringsDefaults=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
};

ControllerLiveMusicArchive.prototype.getLiveMusicArchiveinI18nString = function (key) {
  var self=this;

  if (self.i18nStrings[key] !== undefined)
    return self.i18nStrings[key];
  else
    return self.i18nStringsDefaults[key];
};

ControllerLiveMusicArchive.prototype.compareSortKey = function (a, b) {
	const sortKeyA = a.sortKey;
	const sortKeyB = b.sortKey;

	let comparison = 0;
	if (sortKeyA > sortKeyB) {
		comparison = 1;
	}
	else if (sortKeyA < sortKeyB) {
		comparison = -1;
	}
	return comparison;
}

/*ControllerLiveMusicArchive.prototype.removeDuplicates = function (arr, key) {
	//from: https://www.tjcafferkey.me/remove-duplicates-from-array-of-objects/
	if (!(arr instanceof Array) || key && typeof key !== 'string') {
	 return false;
	}
	if (key && typeof key === 'string') {
		return arr.filter((obj, index, arr) => {
			return arr.map(mapObj => mapObj[key]).indexOf(obj[key]) === index;
		});
	} else {
		return arr.filter(function(item, index, arr) {
			return arr.indexOf(item) == index;
		});
	}
}
*/

ControllerLiveMusicArchive.prototype.sanatizeForBash = function (dirtyString) {
  var saniString = dirtyString.replace(/_/g, '');
  saniString = saniString.replace(/ /g, '_');
  saniString = saniString.replace(/[^a-zA-Z0-9_-]/g, '');
  saniString = saniString.toLowerCase();
  return saniString;
}
