var Application = require('./Application');
var async = require('async');
var FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
var guid = require('uuid');
var TelepatError = require('./TelepatError');

/**
 * Gets an user by email address
 * @param user Object object containing the id or email address of the user
 * @param callback
 * @constructor
 */
function User(user, appId, callback) {
	if (user.id) {
		Application.datasource.dataStorage.getObjects([user.id], function(errs, results) {
			if (errs && errs.length > 0) return callback(errs[0]);
			callback(null, results[0]);
		});
	} else if (user.username) {
		var filters = (new FilterBuilder('and')).addFilter('is', {application_id: appId}).addFilter('is', {username: user.username});
		Application.datasource.dataStorage.searchObjects({modelName: 'user', filters: filters}, function(err, results) {
			if (err)
				return callback(err);
			if (!results.length)
				return callback(new TelepatError(TelepatError.errors.UserNotFound));
			callback(null, results[0]);
		});
	}
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
	var self = this;
	props.id = props.id || guid.v4();
	props.application_id = appId;
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;
	props.type = 'user';

	if (!props.hasOwnProperty('friends'))
		props.friends = [];

	if (!props.hasOwnProperty('devices'))
		props.devices = [];

	var userMetadata = {
		id: guid.v4(),
		user_id: props.id,
		application_id: appId,
		type: 'user_metadata'
	};

	User({username: props.username}, appId, function(err, result) {
		if (err && err.status == 404) {
			Application.datasource.dataStorage.createObjects([props, userMetadata], function(errs) {
				if (errs && errs.length) {
					errs.forEach(function(error) {
						Application.logger.error(error.message);
					});
					return callback(new TelepatError(TelepatError.errors.ServerFailure, ['failed to create user.']));
				}

				callback(null, props);
			});
		} else {
			callback(new TelepatError(TelepatError.errors.UserAlreadyExists));
		}
	});
}

User.count = function(appId, callback) {
	var filters = null;
	if (appId)
		filters = (new FilterBuilder()).addFilter('is', {application_id: appId});

	Application.datasource.dataStorage.countObjects({modelName: 'user', filters: filters}, callback);
}

/**
 * Updates a user
 * @param patches Object[] The new/updated properties of the user.
 * @param callback
 */
User.update = function(patches, callback) {
	Application.datasource.dataStorage.updateObjects(patches, function(errs, dbObjects) {
		if (errs.length) {
			return callback(errs[0]);
		}

		var objId = Object.keys(dbObjects)[0];

		callback(null, dbObjects[objId]);
	});
}

/**
 * Deletes a user.
 * @param id string Email address of the user.
 * @param callback
 */
User.delete = function(id, appId, callback) {
	var user = null;

	async.series([
		function(callback1) {
			User({id: id}, appId, function(err, result) {
				if (err) return callback1(err);

				user = result;
				callback1();
			});
		},
		function deleteSubscriptions(callback1) {
			async.each(user.devices, function(deviceId, c1) {
				Application.redisClient.get('blg:devices:'+deviceId, function(err, response) {
					if (err) return c1(err);

					if (response) {
						var device = JSON.parse(response);
						if (device.subscriptions) {
							var transaction = Application.redisClient.multi();

							device.subscriptions.each(function(sub) {
								transaction.srem([sub, deviceId]);
							});

							transaction.del('blg:devices:'+deviceId);

							transaction.exec(function(err, res) {
								if (err) Application.logger.warning('Failed removing device from subscriptions: '+err.message);
							});
						}
					}
					c1();
				});
			});
			callback1();
		},
		function(callback1) {
			var usrObj = {};
			usrObj[id] = 'user';
			Application.datasource.dataStorage.deleteObjects(usrObj, function(errs) {
				callback1(errs && errs.length > 1 ? errs[0] : null);
			});
		},
		function(callback1) {
			var deleteUserObjects = function(obj) {
				var deleteObjects = {};
				async.each(obj, function(o, c) {
					deleteObjects[o.id] = o.type;
					c();
				}, function() {
					Application.datasource.dataStorage.deleteObjects(deleteObjects, function(errs) {
						if (errs && errs.length > 1) {
							Application.logger.warning('Failed to delete '+errs.length+' user objects.');
						}
					});
				});
			};
			var filter = (new FilterBuilder()).addFilter('is', {user_id: id});
			Application.datasource.dataStorage.searchObjects({filters: filter, fields: ['id', 'type'], scanFunction: deleteUserObjects}, callback1);
		}
	], callback);
};

User.getAll = function(appId, offset, limit, callback) {
	var filters = (new FilterBuilder()).addFilter('is', {application_id: appId});
	Application.datasource.dataStorage.searchObjects({modelName: 'user', filters: filters, offset: offset, limit: limit}, callback);
};

User.search = function(appId, filters, offset, limit, callback) {
	var filterBuilder = (new FilterBuilder()).addFilter('is', {application_id: appId});

	Object.keys(filters).forEach(function (field) {
		var fieldObject = {};
		fieldObject[field] = filters[field];
		filterBuilder.addFilter('like', fieldObject);
	});

	Application.datasource.dataStorage.searchObjects({modelName: 'user', filters: filterBuilder, offset: offset, limit: limit}, callback);
};

User.getMetadata = function(userId, callback) {
	var filters = (new FilterBuilder()).addFilter('is', {user_id: userId});
	Application.datasource.dataStorage.searchObjects({modelName: 'user_metadata', filters: filters}, function(err, results) {
		if (err) return callback(err);
		callback(null, results[0]);
	});
};

User.updateMetadata = function(userId, patches, callback) {
	Application.datasource.dataStorage.updateObjects(patches, function(errs) {
		callback(errs && errs.length ? errs[0] : null);
	});
};

module.exports = User;
