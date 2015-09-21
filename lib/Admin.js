var Application = require('./Application');
var User = require('./User');
var async = require('async');

/**
 * Retrieves an admin by email address.
 * @param _id string The email address
 * @param callback
 * @constructor
 */
function Admin(email, callback) {
	Application.datasource.dataStorage.adminGet(email, callback);
}

/**
 * Loads the configuration spec file. Automatically called at module require.
 */
Admin.load = function() {
	Admin._model = require('../models/admin.json');

	if (!Admin._model)
		throw new Error('Model spec file does not exist.');
};

/**
 * Creates a new admin.
 * @param email string The email address of the admin
 * @param props Object Properties
 * @param callback
 */
Admin.create = function(email, props, callback) {
	Application.datasource.dataStorage.adminCreate(email, props, callback);
}

/**
 * Updates an admin object
 * @param email Email address
 * @param patches[] Properties
 * @param callback
 */
Admin.update = function(patches, callback) {
	Application.datasource.dataStorage.adminUpdate(patches, callback);
}

Admin.delete = function(email, callback) {
	Application.datasource.dataStorage.adminDelete(email, callback);
}

module.exports = Admin;
