var Application = require('./Application');
var async = require('async');
var FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
var guid = require('uuid');

/**
 * Gets a context object.
 * @param _id number Context ID
 * @param callback
 * @constructor
 */
function Context(_id, callback) {
	Application.datasource.dataStorage.getObjects([_id], function(errs, results) {
		if (errs) return callback(errs[0]);
		callback(null, results[0]);
	});
}

/**
 * Loads the configuration spec file. Automatically called at module require.
 */
Context.load = function() {
	Context._model = require('../models/context.json');

	if (!Context._model) {
		Application.logger.emergency('Model \'context\' spec file does not exist.');
		process.exit(-1);
	}
};

/**
 * Get all contexts.
 * @param [by_app] integer Gets the context only from this application.
 * @param callback
 */
Context.getAll = function(by_app, offset, limit, callback) {
	var filter = null;
	offset = offset || 0;
	limit = limit || Application.datasource.dataStorage.config.get_limit;

	if (by_app)
		filter = (new FilterBuilder('and')).addFilter('is', {application_id: by_app});

	Application.datasource.dataStorage.searchObjects({modelName: 'context', filters: filter, offset: offset, limit: limit}, callback);
}

/**
 * Gets the curent index of the contexts.
 * @param callback
 */
Context.count = function(callback) {
	Application.datasource.dataStorage.countObjects({modelName: 'context'}, callback);
}


/**
 * Creates a new context
 * @param props Object properties of the context
 * @param callback
 */
Context.create = function(props, callback) {
	props.type = 'context';
	props.id = guid.v4();
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;

	Application.datasource.dataStorage.createObjects([props], function(err) {
		if (err) return callback(err);
		callback(null, props);
	});
}

/**
 * Updates a context.
 * @param id integer Context ID
 * @param patches[] Object The new properties of the context
 * @param callback
 */
Context.update = function(patches, callback) {
	Application.datasource.dataStorage.updateObjects([patches], function(errs) {
		callback(errs.length ? errs[0] : null);
	});
}

/**
 * Deletes a context and all of its objects and subscriptions
 * @param id integer Context ID
 * @param callback
 */
Context.delete = function(id, callback) {
	var delObj = {};
	delObj[id] = 'context';

	async.series([
		function(callback1) {
			Application.datasource.dataStorage.deleteObjects(delObj, function(errs) {
				if (errs) return callback(errs[0]);
				callback();
			});
		},
		function(callback1) {
			var deleteContextObjects = function(obj) {
				var deleteObjects = {};
				async.each(obj, function(o, c) {
					deleteObjects[o.id] = o.type;
					c();
				}, function() {
					Application.datasource.dataStorage.deleteObjects(deleteObjects, function(errs) {
						if (errs && errs.length > 1) {
							Application.logger.warning('Failed to delete '+errs.length+' context objects.');
						}
					});
				});
			};
			var filter = (new FilterBuilder()).addFilter('is', {context_id: id});
			Application.datasource.dataStorage.searchObjects({filters: filter, fields: ['id', 'type'], scanFunction: deleteContextObjects}, callback1);
		}
	], callback);
}

module.exports = Context;
