var Application = require('./Application');
var User = require('./User');
var async = require('async');

/**
 * Retrieves an admin by email address.
 * @param admin Object objecty containing either admin email address or id
 * @param callback
 * @constructor
 */
function Admin(admin, callback) {
	Application.datasource.dataStorage.adminGet(admin, callback);
}

/**
 * Loads the configuration spec file. Automatically called at module require.
 */
Admin.load = function() {
	Admin._model = require('../models/admin.json');

	if (!Admin._model) {
		Application.logger.emergency('Model \'admin\' spec file does not exist.');
		process.exit(-1);
	}
};

/**
 * Creates a new admin.
 * @param email string The email address of the admin
 * @param props Object Properties
 * @param callback
 */
Admin.create = function(email, props, callback) {
	props.type = 'admin',
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
