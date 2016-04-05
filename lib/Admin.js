var Application = require('./Application');
var User = require('./User');
var async = require('async');
var FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
var guid = require('uuid');
var TelepatError = require('./TelepatError');

/**
 * @callback adminCb
 * @param {TelepatError|Error|null} err
 * @param {Object] admin
 */
/**
 * Retrieves an admin by email address or id.
 * @param {Object} admin
 * @param {Object} [admin.id]
 * @param {Object} [admin.email]
 * @param {adminCb} callback
 * @constructor
 */
function Admin(admin, callback) {
	if (admin.id)
		Application.datasource.dataStorage.getObjects([admin.id], function(errs, results) {
			if (errs.length)
				return callback(errs[0]);
			callback(null, results[0]);
		});
	else if (admin.email) {
		var filter = new FilterBuilder();
		filter.addFilter('is', {email: admin.email});

		Application.datasource.dataStorage.searchObjects({modelName: 'admin', filters: filter}, function(err, results) {
			if (err)
				return callback(err);
			if (!results.length)
				return callback(new TelepatError(TelepatError.errors.AdminNotFound));

			callback(null, results[0]);
		});
	}
}

/**
 * Creates a new admin.
 * @param {string} email The email address of the admin
 * @param {Object} props Properties of the admin
 * @param {adminCb} callback
 */
Admin.create = function(email, props, callback) {
	props.email = email;
	props.id = guid.v4();
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;
	props.type = 'admin';
	Application.datasource.dataStorage.createObjects([props], function(err) {
		callback(err, props);
	});
}

/**
 * Updates an admin object
 * @param {Object[]} patches
 * @param {adminCb} callback
 */
Admin.update = function(patches, callback) {
	Application.datasource.dataStorage.updateObjects(patches, function(errs) {
		callback(errs && errs.length ? errs[0] : null);
	});
}

/**
 *
 * @param {string} email
 * @param {adminCb} callback
 */
Admin.delete = function(admin, callback) {
	async.waterfall([
		function get(callback1) {
			new Admin(admin, callback1);
		},
		function deleteAdmin(admin, callback1) {
			var adminToDelete = {};
			adminToDelete[admin.id] = 'admin';
			Application.datasource.dataStorage.deleteObjects(adminToDelete, function(errs) {
				callback1(errs && errs.length ? errs[0] : null);
			});
		}
	], callback);
}

module.exports = Admin;
