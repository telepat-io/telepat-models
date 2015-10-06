var Application = require('./Application');
var TelepatError = require('./TelepatError');
var async = require('async');
/**
 * Retrieves a single item of a certain type
 * @param name Name of the model/type
 * @param appId ID of the app of the model
 * @param _id ID of the item
 * @param callback
 * @constructor
 */
function Model(name, appId, context_id, _id, callback) {
	if (!Application.loadedAppModels[appId]) {
		return callback(new TelepatError(TelepatError.errors.ApplicationNotFound, [appId]));
	}
	if (!Application.loadedAppModels[appId].schema[name]) {
		return callback(new TelepatError(TelepatError.errors.ApplicationSchemaModelNotFound, [appId, name]));
	}

	Application.datasource.dataStorage.modelGet(name, appId, context_id, _id, callback);
}
/**
 * Get multiple items at once
 * @param modelName Name of the model/type
 * @param ids An array of ids of the items you want to get
 * @param appId ID of the app of the model
 * @param context The context of the item
 * @param callback
 */
Model.multiGet = function(modelName, ids, appId, context, callback) {
	Application.datasource.dataStorage.modelMultiGet(modelName, ids, appId, context, callback);
}
/**
 * Gets all items from a context
 * @param modelName Name of the model/type
 * @param appId ID of the app of the model
 * @param context The context of the item
 * @param callback function(error, result)
 */
Model.getAll = function(modelName, appId, context, callback) {
	Application.datasource.dataStorage.modelGetAll(modelName, appId, context, callback);
}

Model.delete = function(modelName, appId, context, id, onlyChild, callback) {
	Application.datasource.dataStorage.modelDelete(modelName, appId, context, id, onlyChild, callback);
};

/**
 * Used for unique IDs
 * @param modelName
 * @param callback
 */
Model.count = function(modelName, appId, callback) {
	Application.datasource.dataStorage.modelCount(modelName, appId, callback);
}

Model.create = function(modelName, appId, props, callback) {
	Application.datasource.dataStorage.modelCreate(modelName, appId, props, callback);
};

/**
 * Updates and item
 * @param props changed properties of the model
 * @param user_id author of the model
 * @param parent parent of the model ({name, id} object)
 * @param cb
 */
Model.update = function(modelName, context, appId, id, patches, callback) {
	Application.datasource.dataStorage.modelUpdate(modelName, appId, context, id, patches, callback);
};

Model.search = function(channel, page, callback) {
	Application.datasource.dataStorage.modelSearch(channel, page, callback);
};

Model.modelCountByChannel = function(channel, callback) {
	Application.datasource.dataStorage.modelCountByChannel(channel, callback);
};

module.exports = Model;
