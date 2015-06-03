var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

/**
 * Gets an user by email address
 * @param _id string Email address
 * @param callback
 * @constructor
 */
function User(_id, callback) {
	Application.bucket.get('blg:'+User._model.namespace+':'+_id, (function(err, res) {
		if (!err) {
			var result = res.value;

			for(var prop in User._model.properties) {
				if (User._model.properties.hasOwnProperty(prop)) {
					this[prop] = result[prop];
				}
			}
		}

		callback(err, result);
	}).bind(this));
}

/**
 * Loads the configuration spec file. Automatically loaded at module require.
 */
User.load = function() {
	User._model = require('../models/user.json');

	if (!User._model)
		throw new Error('Model spec file does not exist.');
};

/**
 * Creates a user
 * @param props Object Properties of the user.
 * @param callback
 */
User.create = function(props, callback) {
	var acceptedProps = {};
	async.waterfall([
		function(callback1) {
			User.count(callback1);
		},
		function(count, callback1) {
			var idx = count+1;
			var key = 'blg:'+User._model.namespace+':'+props.email;

			for(var prop in User._model.properties) {
				if (User._model.properties.hasOwnProperty(prop)) {
					acceptedProps[prop] = props[prop];
				}
			}

			acceptedProps.id = idx;
			acceptedProps.type = 'user';

			Application.bucket.insert(key, acceptedProps, function(err, result) {
				if (err) return callback1(err);

				callback1(null, acceptedProps);
			});
		}, function(results, callback) {
			User.increment(callback);
		}, function(result, callback) {
			var key = 'blg:'+User._model.namespace+':fid:'+acceptedProps.fid;
			Application.bucket.insert(key, acceptedProps.email, callback);
		}
	], function(err, result) {
		if (err) return callback(err);

		callback(null, acceptedProps);
	});
}

User.count = function(callback) {
	var key = 'blg:'+User._model.namespace+':count';
	Application.bucket.get(key, function(err, result) {
		if (err && err.code == cb.errors.keyNotFound) {
			Application.bucket.counter(key, 1, {initial: 0}, function(err1, result1) {
				if (err1) return callback(err1);
				callback(null, 0);
			});
		} else if (err)
			callback(err)
		else
			callback(null, result.value);
	});
}

User.increment = function(callback) {
	var key = 'blg:'+User._model.namespace+':count';
	Application.bucket.counter(key, 1, {initial: 0}, callback);
}

/**
 * Updates a user
 * @param id string Email address of the user
 * @param props Object The new/updated properties of the user.
 * @param callback
 */
User.update = function(id, props, callback) {
	async.waterfall([
		function(callback1) {
			new User(id, callback1);
		},
		function(result, callback1) {
			var user = result;

			for(var p in props) {
				user[p] = props[p];
			}

			var key = 'blg:'+User._model.namespace+':'+id;
			Application.bucket.replace(key, user, callback);
		}
	], callback);
}

/**
 * Deletes a user.
 * @param id string Email address of the user.
 * @param callback
 */
User.delete = function(id, callback) {
	var userKey = 'blg:'+User._model.namespace+':'+id;
	Application.bucket.remove(userKey, callback);
}

module.exports = User;
