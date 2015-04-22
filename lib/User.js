var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

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

User.load = function() {
	User._model = require('../models/user.json');

	if (!User._model)
		throw new Error('Model spec file does not exist.');
};

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
			acceptedProps.authenticated = 0;
			acceptedProps.subscriptions = [];

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

User.update = function(id, patches, callback) {
	async.waterfall([
		function(callback1) {
			new User(id, callback1);
		},
		function(result, callback1) {
			var user = result;

			for (var i in patches) {
				if (patches.hasOwnProperty(i) && User._model.properties[patches[i].path]) {
					switch (patches[i].op) {
						case 'replace': {
							user[patches[i].path] = patches[i].value;

							break;
						}

						case 'increment': {
							user[patches[i].path] += patches[i].value;

							break;
						}

						case 'append': {
							if (User._model.properties[patches[i].path].type == 'array') {
								if (user[patches[i].path].indexOf(patches[i].value) === -1)
									user[patches[i].path].push(patches[i].value);
							}
							else
								user[patches[i].path] += patches[i].value;

							break;
						}
					}
				}
			}

			var key = 'blg:'+User._model.namespace+':'+id;
			Application.bucket.replace(key, user, callback);
		}
	], callback);
}

User.delete = function(id, callback) {
	var user = {};

	async.waterfall([
		function getUser(callback1) {
			new User(id, function(err, result) {
				user = result;
				callback1(err, result);
			});
		},
		function deleteSubscriptions(result, callback1) {
			var baseKey = 'blg:devices:';

			async.each(Object.keys(user.subscriptions), function(deviceId, c1) {
				async.each(user.subscriptions[deviceId], function(sub, c2) {

					async.waterfall([
						function(callback2) {
							Application.stateBucket.getAndLock(sub, callback2);
						},
						function(result, callback2) {
							var devices = JSON.parse('['+result.value.slice(0, -1)+']');
							var idx = devices.indexOf(deviceId);

							if (idx !== -1)
								devices.splice(idx, 1);

							async.map(devices, function(item, c) {
								c(JSON.stringify(item));
							}, function(resultDevices) {
								Application.stateBucket.replace(sub, resultDevices.toString()+',', {cas: result.cas}, callback2);
							});
						}
					], c2);

				}, c1);
			}, callback1);
		},
		function deleteItems(result, callback1) {
			var query = cb.ViewQuery.from('dev_models', 'by_author').custom({inclusive_end: true, key: user.id});

			async.waterfall([
				function(callback2) {
					Application.bucket.query(query, callback2);
				},
				function(results, callback2) {
					async.each(Object.keys(results), function(objectKey, c) {
						Application.bucket.remove(objectKey, c);
					}, callback2);
				}
			], callback1);
		},
		function deleteLookupKeys(result, callback1) {
			var query = cb.ViewQuery.from('dev_models', 'by_author_lookup').custom({inclusive_end: true, key: user.id});
			async.waterfall([
				function(callback2) {
					Application.bucket.query(query, callback2);
				},
				function(callback2) {
					async.each(result, function(item, c) {
						Application.bucket.remove(item.id, c);
					}, callback2);
				}
			], callback1);
		},
		function deleteUserInFriends(result, callback1) {
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
						//User.update(result.email, [{op: "replace", path: "friends", value: result.friends}], callback2);
					}
				], c);
			}, callback1);
		},
		function deleteMainKey(result, callback1) {
			var userKey = 'blg:'+User._model.namespace+':'+id;
			Application.bucket.remove(userKey, callback1);
		}
	], callback);
}

module.exports = User;
