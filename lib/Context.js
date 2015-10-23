var Application = require('./Application');
var async = require('async');

/**
 * Gets a context object.
 * @param _id number Context ID
 * @param callback
 * @constructor
 */
function Context(_id, callback) {
	Application.datasource.dataStorage.contextGet(_id, callback);
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
Context.getAll = function(by_app, callback) {
	Application.datasource.dataStorage.contextGetAll(by_app, callback);
}

/**
 * Gets the curent index of the contexts.
 * @param callback
 */
Context.count = function(callback) {
	Application.datasource.dataStorage.contextCount(callback);
}


/**
 * Creates a new context
 * @param props Object properties of the context
 * @param callback
 */
Context.create = function(props, callback) {
	props.type = 'context';
	Application.datasource.dataStorage.contextCreate(props, callback);
}

/**
 * Updates a context.
 * @param id integer Context ID
 * @param patches[] Object The new properties of the context
 * @param callback
 */
Context.update = function(id, patches, callback) {
	Application.datasource.dataStorage.contextUpdate(id, patches, callback);
}

/**
 * Deletes a context and all of its objects and subscriptions
 * @param id integer Context ID
 * @param callback
 */
Context.delete = function(id, callback) {
	Application.datasource.dataStorage.contextDelete(id, callback);
}

module.exports = Context;
