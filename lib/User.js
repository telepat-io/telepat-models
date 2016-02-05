var Application = require('./Application');
var async = require('async');

/**
 * Gets an user by email address
 * @param user Object object containing the id or email address of the user
 * @param callback
 * @constructor
 */
function User(user, appId, callback) {
	Application.datasource.dataStorage.userGet(user, appId, callback);
}

/**
 * Loads the configuration spec file. Automatically loaded at module require.
 */
User.load = function() {
	User._model = require('../models/user.json');

	if (!User._model) {
		Application.logger.emergency('Model \'user\' spec file does not exist.');
		process.exit(-1);
	}
};

/**
 * Creates a user
 * @param props Object Properties of the user.
 * @param callback
 */
User.create = function(props, appId, callback) {
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;
	props.type = 'user';
	Application.datasource.dataStorage.userCreate(props, appId, callback);
}

User.count = function(appId, callback) {
	Application.datasource.dataStorage.userCount(appId, callback);
}

/**
 * Updates a user
 * @param id string Email address of the user
 * @param patches Object[] The new/updated properties of the user.
 * @param callback
 */
User.update = function(id, appId, patches, callback) {
	Application.datasource.dataStorage.userUpdate(id, appId, patches, callback);
}

/**
 * Deletes a user.
 * @param id string Email address of the user.
 * @param callback
 */
User.delete = function(id, appId, callback) {
	Application.datasource.dataStorage.userDelete(id, appId, callback);
}

User.getAll = function(appId, offset, limit, callback) {
	Application.datasource.dataStorage.userGetAll(appId, offset, limit, callback);
}

User.getMetadata = function(userId, callback) {
	Application.datasource.dataStorage.userGetMetadata(userId, callback);
};

User.updateMetadata = function(userId, patches, callback) {
	Application.datasource.dataStorage.userUpdateMetadata(userId, patches, callback);
};

module.exports = User;
