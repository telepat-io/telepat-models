var Application = require('./Application');
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

			for(var prop in result) {
				this[prop] = result[prop];
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
	async.waterfall([
		function(callback1) {
			User.count(callback1);
		},
		function(count, callback1) {
			var idx = count+1;
			var key = 'blg:'+User._model.namespace+':'+props.email;

			props.id = idx;
			props.type = 'user';

			Application.bucket.insert(key, props, function(err, result) {
				if (err) return callback1(err);

				callback1(null, props);
			});
		}, function(results, callback) {
			User.increment(callback);
		}, function(result, callback) {
			if (props.fid) {
				var key = 'blg:'+User._model.namespace+':fid:'+props.fid;
				Application.bucket.insert(key, props.email, callback);
			} else
				callback();

		}
	], function(err, result) {
		if (err) return callback(err);

		callback(null, props);
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
	async.waterfall([
		function(callback1) {
			User(id, callback1);
		},
		function(user, callback1) {
			Application.bucket.remove(userKey, function(err, res) {
				if (err) return callback1(err);

				callback1(null, user);
			});
		},
		function(user, callback1) {
			User.deleteUserRelatedKeys(user, callback1);
		}
	], callback);
}

User.getByApplication = function(appId, callback) {
	var query = cb.ViewQuery.from('dev_models', 'by_app_users').custom({stale: false, inclusive_end: true, key: appId});
	Application.bucket.query(query, function(err, results) {
		if (err) return callback(err);
		var users = [];

		results.forEach(function(user) {
			users.push(user.value);
		});

		callback(null, users);
	});
}

User.deleteUserRelatedKeys = function(user, callback) {
	var deletedObjects = [];
	async.series([
		function deleteSubscriptions(callback1) {
			async.each(user.devices, function(deviceId, c1) {
				Application.redisClient.get('blg:devices:'+deviceId, function(err, response) {
					if (err) return c1(err);

					if (response) {
						var device = JSON.parse(response);
						if (device.subscriptions) {
							async.each(device.subscriptions, function(subscription, c2) {
								Application.redisClient.srem([subscription, deviceId], function(err, res) {});
								c2();
							});
						}
						Application.redisClient.del('blg:devices:'+deviceId, function(err, res) {});
					}
					c1();
				});
			});
			callback1();
		},
		function deleteItems(callback1) {
			var query = cb.ViewQuery.from('dev_models', 'by_author').custom({inclusive_end: true, key: user.id});

			async.waterfall([
				function(callback2) {
					Application.bucket.query(query, callback2);
				},
				function(results, count, callback2) {
					async.each(results, function(object, c) {
						deletedObjects.push(object);
						c();
					}, callback2);
				}
			], callback1);
		},
		function deleteLookupKeys(callback1) {
			var query = cb.ViewQuery.from('dev_models', 'by_author_lookup').custom({inclusive_end: true, key: user.id});
			async.waterfall([
				function(callback2) {
					Application.bucket.query(query, callback2);
				},
				function(result, count, callback2) {
					async.each(result, function(item, c) {
						Application.bucket.remove(item.id, c);
					}, callback2);
				}
			], callback1);
		},
		function deleteUserInFriends(callback1) {
			async.each(user.friends, function(f, c) {
				var key = 'blg:'+User._model.namespace+':fid:'+f;
				async.waterfall([
					function(callback2) {
						Application.bucket.get(key, callback2);
					},
					function(result, callback2) {
						var userEmail = result.value;
						new User(userEmail, callback2);
					},
					function(result, callback2) {
						var idx = result.friends.indexOf(f);
						if (idx !== -1)
							result.friends.splice(idx, 1);

						Application.bucket.replace(key, result, callback2);
					}
				], c);
			}, callback1);
		}
	], function(err) {
		if (err) return callback(err);

		callback(null, deletedObjects);
	});
};

module.exports = User;
