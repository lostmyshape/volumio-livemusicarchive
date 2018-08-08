'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var unirest = require('unirest');

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

	if (curUri.startsWith("livemusicarchive")) {
		if (curUri == "livemusicarchive") {
			self.resetHistory();
			self.historyAdd(curUri);
			//List band collections as root menu
			response = self.listCollections();

		}

	}


  return response;
};

ControllerLiveMusicArchive.prototype.listCollections = function () {
	var self = this;
	var defer = libQ.defer();
	var uri = lmaApiBaseUrl + 'q=mediatype%3Acollection+AND+collection%3Aetree+AND+format%3AArchive+Bittorrent&fl[]=identifier&fl[]=title&rows=1000000&page=1&output=json';
	console.log(uri);

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

	unirest.get(uri).end( function(res){
		if (res.error){
			defer.reject(new Error(self.getLiveMusicArchiveinI18nString('QUERY_ERROR')));
			self.commandRouter.pushToastMessage('error', self.getLiveMusicArchiveinI18nString('LMA_QUERY'), self.getLiveMusicArchiveinI18nString('QUERY_ERROR'));
			self.historyPop();
		}
		else {
			for (var i = 0; i < res.body.response.docs.length; i++) {
				var bandName = res.body.response.docs[i].title;
				var collectionUri = 'livemusicarchive/' + res.body.response.docs[i].identifier;
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
		}
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
