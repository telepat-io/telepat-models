var async = require('async');
var FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
var guid = require('uuid');
var TelepatError = require('./TelepatError');

/**
 * @typedef {{
 * 		relationType: string,
 *		parentModel: string
 * }} Relation
 */

/**
 * @typedef {{
 * 		meta_read_acl: Number,
 * 		read_acl: Number,
 *		write_acl: Number,
 *		properties: Object,
 *		belongsTo: Relation[],
 *		hasSome: string[],
 *		hasMany: string[],
 *		hasSome_property: string,
 *		ios_push_field: string,
 *		author_fields: string[]
 * }} Model
 */

/**
 * @typedef {{
 * 		name: string,
 * 		keys: string[],
 * 		admins: string[],
 * 		type: "application",
 * 		id: "id",
 * 		created: 0,
 * 		modified: Number,
 * 		email_confirmation: Boolean,
 * 		from_email: string,
 * 		password_reset: Object,
 *		password_reset.android_app_link: string,
 *		password_reset.app_link: string,
 *		password_reset.web_link: string,
 *		schema: Object.<string, Model>,
 *		apn_key: string,
 *		apn_key_id: string,
 *		apn_team_id: string,
 *		apn_topic: string,
 *		gcm_api_key: string,
 *		email_templates: {weblink: string, confirm_account: string, after_confirm: string, reset_password: string}
 * 	}} App
 */

/**
 * Gets an application by id.
 * @param _id integer Application id
 * @param callback
 * @constructor
 * @property bucket Bucket Couchbase data bucket
 * @property stateBucket Bucket Couchbase state bucket
 * @property {Object} loadedAppModels
 * @property {Object.<string, App>} loadedAppModels.<string>
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

			Application.datasource.dataStorage.getObjects([id], function(err, results) {
				if (err & err.length) return callback1(err[0]);
				callback1(null, results[0]);
			});
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

Application.loadedAppModels = {};

/**
 *
 * @type {RedisClient}
 */
Application.redisClient = null;

/**
 *
 * @type {RedisClient}
 */
Application.redisCacheClient = null;

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
 * Gets all aplications
 * @param callback
 */
Application.loadAllApplications = function(offset, limit, callback) {
	offset = offset || 0;
	limit = limit || Application.datasource.dataStorage.config.get_limit;

	Application.datasource.dataStorage.searchObjects({modelName: 'application', offset: offset, limit: limit}, function(err, applications) {
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
	Application.datasource.dataStorage.countObjects({modelName: 'application'}, callback);
};

/**
 * Creates a new application
 * @param props Object properties
 * @param callback
 */
Application.create = function(props, callback) {
	props.id = guid.v4();
	props.keys = props.keys || [];
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;
	props.type = 'application';
	Application.datasource.dataStorage.createObjects([props], function(errs) {
		if (errs) return callback(errs[0]);

		Application.loadedAppModels[props.id] = props;

		callback(null, props);
	});
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
			Application.datasource.dataStorage.updateObjects(patches, function(errs, apps) {
				if (errs && errs.length) return callback1(errs[0]);

				Application.loadedAppModels[id] = apps[id];
				callback1(null, apps[id]);
			});
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
			var appObj = {};
			appObj[id] = 'application';
			Application.datasource.dataStorage.deleteObjects(appObj, callback1);
		},
		function(callback1) {
			delete Application.loadedAppModels[id];
			var deleteAppObjects = function(obj) {
				var deleteObjects = {};
				async.each(obj, function(o, c) {
					deleteObjects[o.id] = o.type;
					c();
				}, function() {
					Application.datasource.dataStorage.deleteObjects(deleteObjects, function(errs) {
						if (errs && errs.length > 1) {
							Application.logger.warning('Failed to delete '+errs.length+' application objects.');
						}
					});
				});
			};

			var filter = (new FilterBuilder()).addFilter('is', {application_id: id});
			Application.datasource.dataStorage.searchObjects({filters: filter, fields: ['id', 'type'], scanFunction: deleteAppObjects}, callback1);
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
	if (!Application.loadedAppModels[appId])
		return callback(new TelepatError(TelepatError.errors.ApplicationNotFound, [appId]));
	else if (!Application.loadedAppModels[appId].schema)
		return callback(new TelepatError(TelepatError.errors.ApplicationHasNoSchema, [appId]))

	callback(null, Application.loadedAppModels[appId].schema);
}

/**
 * Updates the model schema of an app
 * @param appId integer Application ID
 * @param schema Object The schema object with updated values.
 * @param callback
 */
Application.updateSchema = function(appId, schema, callback) {
	async.series([
		function(callback1) {
			Application.datasource.dataStorage.updateObjects([
				{
					op: 'replace',
					path: 'application/'+appId+'/schema',
					value: schema
				}
			], function(errs) {
				callback1(errs && errs.length ? errs[0] : null);
			});
		},
		function(callback1) {
			Application.redisClient.del('blg:application:'+appId, function(err, result) {
				if (err) return callback1(err);
				callback1(null, schema);
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
	if (!Application.loadedAppModels[appId])
		return callback(new TelepatError(TelepatError.errors.ApplicationNotFound, [appId]));
	else if (!Application.loadedAppModels[appId].schema)
		return callback(new TelepatError(TelepatError.errors.ApplicationHasNoSchema, [appId]))
	else if (!Application.loadedAppModels[appId].schema[modelName])
		return callback(new TelepatError(TelepatError.errors.ApplicationSchemaModelNotFound, [appId, modelName]))

	async.series([
		function(callback1) {
			delete Application.loadedAppModels[appId].schema[modelName];
			Application.datasource.dataStorage.updateObjects([
				{
					op: 'replace',
					path: 'application/'+appId+'/schema',
					value: Application.loadedAppModels[appId].schema
				}
			], function(errs, results) {
				if (errs && errs.length)
					return callback1(errs[0]);
				callback1();
			});
		},
		function(callback1) {
			Application.redisClient.del('blg:application:'+appId, callback1);
		}
	], callback);
}

Application.hasContext = function(appId, contextId, callback) {
	Application.datasource.dataStorage.getObjects([contextId], function(err, results) {
		if (err && err[0] && err[0].status == 404)
			return callback(new TelepatError(TelepatError.errors.ContextNotFound));

		callback(null, results[0].application_id == appId);
	});
}

module.exports = Application;
