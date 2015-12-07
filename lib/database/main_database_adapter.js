var Main_Database_Adapter = function(connection) {
	this.applicationModel = require('../../models/application.json');

	if(!this.applicationModel)
		throw new Error('Model spec file does not exist.');

	this.contextModel = require('../../models/context.json');

	if (!this.contextModel)
		throw new Error('Model spec file does not exist.');

	this.userModel = require('../../models/user.json');

	if (!this.userModel)
		throw new Error('Model spec file does not exist.');

	this.connection = connection;
	this.onReadyCallback = null;
};

Main_Database_Adapter.prototype.onReady = function(callback) {
	this.onReadyCallback = callback;
};

Main_Database_Adapter.prototype.applicationGet = function(id, callback) {};
Main_Database_Adapter.prototype.applicationGetAll = function(callback) {};
Main_Database_Adapter.prototype.applicationCount = function(callback) {};
Main_Database_Adapter.prototype.applicationCreate = function(props, callback) {};
Main_Database_Adapter.prototype.applicationUpdate = function(id, patches, callback) {};
Main_Database_Adapter.prototype.applicationDelete = function(id, callback) {};
Main_Database_Adapter.prototype.applicationGetSchema = function(appId, callback) {};
Main_Database_Adapter.prototype.applicationUpdateSchema = function(appId, schema, callback) {};
Main_Database_Adapter.prototype.applicationDeleteModelSchema = function(appId, modelName, callback) {};
Main_Database_Adapter.prototype.applicationHasContext = function(appId, contextId, callback) {};
Main_Database_Adapter.prototype.adminGet = function(admin, calllback) {};
Main_Database_Adapter.prototype.adminCreate = function(email, props, callback) {};
Main_Database_Adapter.prototype.adminUpdate = function(patches, callback) {};
Main_Database_Adapter.prototype.adminDelete = function(admin, callback) {};
Main_Database_Adapter.prototype.contextGet = function(id, callback) {};
Main_Database_Adapter.prototype.contextGetAll = function(appId, callback) {};
Main_Database_Adapter.prototype.contextCount = function(callback) {};
Main_Database_Adapter.prototype.contextCreate = function(props, callback) {};
Main_Database_Adapter.prototype.contextUpdate = function(id, patche, callback) {};
Main_Database_Adapter.prototype.contextDelete = function(id, callback) {};
Main_Database_Adapter.prototype.modelGet = function(name, appId, context_id, id, callback) {};
Main_Database_Adapter.prototype.modelMultiGet = function(modelName, ids, appId, context, callback) {};
Main_Database_Adapter.prototype.modelGetAll = function(modelName, appId, context, callback) {};
Main_Database_Adapter.prototype.modelDelete = function(modelName, appId, context, id, onlyChild, callback) {};
Main_Database_Adapter.prototype.modelCount = function(modelName, appId, callback) {};
Main_Database_Adapter.prototype.modelCountByChannel = function(channel, aggregation, callback) {};
Main_Database_Adapter.prototype.modelCreate = function(modelName, appId, props, callback1) {};
Main_Database_Adapter.prototype.modelUpdate = function(modelName, appId, context, id, patch, callback) {};
Main_Database_Adapter.prototype.modelSearch = function(channel, page, callback) {};
Main_Database_Adapter.prototype.userGet = function(username, appId, callback) {};
Main_Database_Adapter.prototype.userGetAll = function(appId, page, callback) {};
Main_Database_Adapter.prototype.userCreate = function(props, appId, callback) {};
Main_Database_Adapter.prototype.userCount = function(appId, callback) {};
Main_Database_Adapter.prototype.userUpdate = function(username, appId, patch, callback) {};
Main_Database_Adapter.prototype.userDelete = function(username, appId, callback) {};

module.exports = Main_Database_Adapter;
