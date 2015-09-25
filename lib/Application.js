/**
 * Gets an application by id.
 * @param _id integer Application id
 * @param callback
 * @constructor
 * @property bucket Bucket Couchbase data bucket
 * @property stateBucket Bucket Couchbase state bucket
 */
function Application(id, callback) {
	Application.datasource.dataStorage.applicationGet(id, callback);
}
/**
 * @type Object Contains all the loaded application schemas.
 */
Application.loadedAppModels = {};;

/**
 *
 * @type {RedisClient}
 */
Application.redisClient = null;

/**
 *
 * @type {Datasource}
 */
Application.datasource = null;

/**
 * Loads the configuration spec file. Automatically called when module is required.
 */
Application.load = function() {
	Application._model = require('../models/application.json');

	if (!Application._model)
		throw new Error('Model spec file does not exist.');
};

/**
 * Loads the schema of an app
 * @param appId Application ID.
 * @param callback Callback returns an error if application does not exist.
 */
Application.loadAppModels = function(appId, callback) {
	Application.datasource.dataStorage.applicationGetSchema(appId, function(err, result) {
		if (err) return callback(err);

		Application.loadedAppModels[appId] = result;
		callback();
	});
}

/**
 * Gets all aplications
 * @param callback
 */
Application.getAll = function(callback) {
	Application.datasource.dataStorage.applicationGetAll(callback);
}

/**
 * Gets the current application index used for IDs.
 * @param callback
 */
Application.count = function(callback) {
	Application.datasource.dataStorage.applicationCount(callback);
};

/**
 * Creates a new application
 * @param props Object properties
 * @param callback
 */
Application.create = function(props, callback) {
	props.type = 'application';
	Application.datasource.dataStorage.applicationCreate(props, callback);
};

/**
 * Updates an application
 * @param id integer Application ID
 * @param props Object new properties for the application
 * @param callback
 */
Application.update = function(id, patches, callback) {
	Application.datasource.dataStorage.applicationUpdate(id, patches, callback);
}

/**
 * Deletes an application and all of its contexts.
 * @param id integer Application ID.
 * @param callback
 */
Application.delete = function (id, callback) {
	Application.datasource.dataStorage.applicationDelete(id, callback);
}

/**
 * Gets the model schema of an app from database.
 * @param appId ingeger Application ID.
 * @param callback
 */
Application.getAppSchema = function(appId, callback) {
	Application.datasource.dataStorage.applicationGetSchema(appId, callback);
}

/**
 * Updates the model schema of an app
 * @param appId integer Application ID
 * @param schema Object The schema object with updated values.
 * @param callback
 */
Application.updateSchema = function(appId, schema, callback) {
	Application.datasource.dataStorage.applicationUpdateSchema(appId, schema, function(err, schema) {
		if (err) return callback(err);

		Application.loadedAppModels[appId] = schema;
		callback();
	});
}

/**
 * Deletes a model schema along with its items.
 * @param appId integer Application ID
 * @param modelName string The model name to delete
 * @param callback
 */
Application.deleteModel = function(appId, modelName, callback) {
	Application.datasource.dataStorage.applicationDeleteModelSchema(appId, modelName, callback);
}

Application.hasContext = function(appId, contextId, callback) {
	Application.datasource.dataStorage.applicationHasContext(appId, contextId, callback);
}

module.exports = Application;
