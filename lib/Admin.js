var Application = require('./Application');
var User = require('./User');
var cb = require('couchbase');
var async = require('async');

/**
 * Retrieves an admin by email address.
 * @param _id string The email address
 * @param callback
 * @constructor
 */
function Admin(_id, callback) {
	Application.bucket.get('blg:'+Admin._model.namespace+':'+_id, (function(err, res) {
		if (!err) {
			var result = res.value;

			for(var prop in Admin._model.properties) {
				if (Admin._model.properties.hasOwnProperty(prop)) {
					this[prop] = result[prop];
				}
			}
		}

		callback(err, result);
	}).bind(this));
}

/**
 * Loads the configuration spec file. Automatically called at module require.
 */
Admin.load = function() {
	Admin._model = require('../models/admin.json');

	if (!Admin._model)
		throw new Error('Model spec file does not exist.');
};

Admin.prototype.get = function(key) {
	if (this.hasOwnProperty(key))
		return this[key];

	return undefined;
};

/**
 * Creates a new admin.
 * @param _id string The email address of the admin
 * @param props Object Properties
 * @param callback
 */
Admin.create = function(_id, props, callback) {
	var acceptedProps = {};

	for(var prop in Admin._model.properties) {
		if (Admin._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	acceptedProps.isAdmin = true;

	var newKey = 'blg:'+Admin._model.namespace+':'+_id;

	async.waterfall([
		function(callback1) {
			User.count(callback1);
		},
		function(index, callback1) {
			acceptedProps.id = index+1;
			User.increment(callback1);
		},
		function(callback1) {
			Application.bucket.insert(newKey, acceptedProps, callback);
		}
	]);
}

/**
 * Updates an admin object
 * @param _id Email address
 * @param props Properties
 * @param callback
 */
Admin.update = function(_id, props, callback) {
	var key = 'blg:'+Admin._model.namespace+':'+_id;

	Application.bucket.get(key, (function(err, res) {
		if (err)
			return callback(err, res);

		var acceptedProps = res.value;

		for(var prop in Admin._model.properties) {
			if (prop != 'email' && Admin._model.properties.hasOwnProperty(prop)) {
				acceptedProps[prop] = props[prop];
			}
		}

		Application.bucket.replace(key, acceptedProps, callback);
	}));
}

module.exports = Admin;
