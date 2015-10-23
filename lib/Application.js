var async = require('async');

/**
 * Gets an application by id.
 * @param _id integer Application id
 * @param callback
 * @constructor
 * @property bucket Bucket Couchbase data bucket
 * @property stateBucket Bucket Couchbase state bucket
 */
function Application(id, callback) {
	async.waterfall([
		//get from cache
		function(callback1) {
			Application.redisClient.get(['blg:application:'+id], function(err, result) {
				if (err) return callback1(err);

				if (!result)
					return callback1(null, false);

				callback1(null, JSON.parse(result));
			});
		},
		//if application is found send it right away
		//otherwise get it from dataStorage
		function(application, callback1) {
			if(application)
				return callback1(null, application);

			Application.datasource.dataStorage.applicationGet(id, callback1);
		},
		//add to cache with expiration time of 7 weeks
		//all update/delete operation will invalidate this key (redis 'del')
		function(application, callback1) {
			Application.redisClient.set('blg:application:'+id, JSON.stringify(application), 'EX', '604800', function(err) {
				if (err) return callback1(err);
				callback1(null, application);
			});
		}
	], callback);
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
 *
 * @type {TelepatLogger}
 */
Application.logger = null;

/**
 * Loads the configuration spec file. Automatically called when module is required.
 */
Application.load = function() {
	Application._model = require('../models/application.json');

	if (!Application._model) {
		Application.logger.emergency('Model \'application\' spec file does not exist.');
		process.exit(-1);
	}
};

/**
 * Gets all aplications
 * @param callback
 */
Application.loadAllApplications = function(callback) {
	Application.datasource.dataStorage.applicationGetAll(function(err, applications) {
		if (err) return callback(err);

		applications.forEach(function(app) {
			Application.loadedAppModels[app.id] = app;
		});
		callback();
	});
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
	async.waterfall([
		function(callback1) {
			Application.datasource.dataStorage.applicationUpdate(id, patches, callback1);
		},
		function(application, callback1) {
			Application.redisClient.del('blg:application:'+id, function(err) {
				if (err) return callback1(err);
				callback1(null, application);
			});
		}
	], callback);
}

/**
 * Deletes an application and all of its contexts.
 * @param id integer Application ID.
 * @param callback
 */
Application.delete = function (id, callback) {
	async.series([
		function(callback1) {
			Application.datasource.dataStorage.applicationDelete(id, callback1);
		},
		function(callback1) {
			Application.redisClient.del('blg:application:'+id, callback1);
		}
	], callback);
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
	async.waterfall([
		function(callback1) {
			Application.datasource.dataStorage.applicationUpdateSchema(appId, schema, callback1);
		},
		function(newSchema, callback1) {
			Application.redisClient.del('blg:application:'+appId, function(err, result) {
				if (err) return callback1(err);
				callback1(null, newSchema);
			});
		}
	], callback);
}

/**
 * Deletes a model schema along with its items.
 * @param appId integer Application ID
 * @param modelName string The model name to delete
 * @param callback
 */
Application.deleteModel = function(appId, modelName, callback) {
	async.series([
		function(callback1) {
			Application.datasource.dataStorage.applicationDeleteModelSchema(appId, modelName, callback1);
		},
		function(callback1) {
			Application.redisClient.del('blg:application:'+appId, callback1);
		}
	], callback);
}

Application.hasContext = function(appId, contextId, callback) {
	Application.datasource.dataStorage.applicationHasContext(appId, contextId, callback);
}

module.exports = Application;
