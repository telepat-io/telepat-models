var Application = require('./Application');
var async = require('async');
var User = require('./User');
var utils = require('../utils/utils');

function Subscription() {};

/**
 * Get the subscribed devices of a filtered channel
 * @param channel {Channel} object that contains model name and id
 * @param callback
 */
Subscription.getSubscribedDevices = function(channel, callback) {
	Application.redisClient.smembers(channel.get(), callback);
};

/**
 * Adds a subscription
 * @param deviceId string Device ID
 * @param channel {Channel} object that contains model name and id, user and parent {id, model}
 * @param callback
 */
Subscription.add = function(deviceId, channel, callback) {
	async.waterfall([
		function(callback1) {
			Application.redisClient.sadd([channel.get(), deviceId], callback1);
		},
		function(results, callback1) {
			Subscription.getDevice(deviceId, callback1);
		},
		function(results, callback1) {
			results.subscriptions = results.subscriptions || [];

			if (results.subscriptions.indexOf(channel.get()) === -1) {
				results.subscriptions.push(channel.get());
				Subscription.updateDevice(results, null, callback1);
			}

			callback1();
		}
	], callback);
};

/**
 * The object count of the subscribed channel
 * @param channel {Channel} object that contains model name, id and user id and parent {id, model}
 * @param callback
 */
Subscription.getObjectCount = function(channel, callback) {
	var userQuery = {};
	var parentQuery = {};
	var elasticSearchQuery = {
		query: {
			filtered: {
				query: {
					bool: {
						must: [
							{term: {'doc.type': channel.props.model}},
							{term: {'doc.context_id': channel.props.context}}
						]
					}
				}
			}
		}
	};

	if (channel.props.user) {
		userQuery['doc.user_id'] = channel.props.user;
		elasticSearchQuery.query.filtered.query.bool.must.push({term: userQuery});
	}

	if(channel.props.parent) {
		parentQuery['doc.'+channel.props.parent.model+'_id'] = channel.props.parent.id;
		elasticSearchQuery.query.filtered.query.bool.must.push({term: parentQuery});
	}

	elasticSearchQuery.query.filtered.filter = utils.parseQueryObject(channel.filter);
	Application.elasticClient.count({
		index: 'default',
		type: 'couchbaseDocument',
		body: elasticSearchQuery
	}, function(err, result) {
		if (err) return callback(err);

		callback(result.count);
	});
}

/**
 * Adds a new device
 * @param device Object The device properties
 * @param callback
 */
Subscription.addDevice = function(device, callback) {
	var key = 'blg:devices:'+device.id;

	device.subscriptions = [];

	async.parallel([
		function(callback1) {
			if (device.info && device.info.udid) {
				var udidKey = 'blg:devices:udid:'+device.info.udid;
				Application.redisClient.set(udidKey, device.id, callback1);
			} else
				callback1();

		},
		function(callback1) {
			Application.redisClient.set(key, JSON.stringify(device), callback1);
		}
	], callback);
};

/**
 * Removes the subscription
 * @param context integer Context ID
 * @param deviceId string Device ID
 * @param channel Object object that contains model name and id
 * @param filters Object filter that contains user ID and and an object of parent (model & id)
 * @param callback
 */
Subscription.remove = function(deviceId, channel, callback){
	async.waterfall([
		function(callback1) {
			Subscription.getDevice(deviceId, callback1);
		},
		function(device, callback1) {
			var idx = device.subscriptions.indexOf(channel.get());
			device.subscriptions.splice(idx, 1);

			Subscription.updateDevice(deviceId, device, callback1);
		},
		function(result, callback1) {
			Application.redisClient.srem([channel.get(), deviceId], callback1);
		},
		function(removed, callback1) {
			if (removed === 0)
				return callback1(new Error('Subscription not found'));
			callback1();
		}
	], callback);
};

/**
 * Gets a device.
 * @param id string Device ID
 * @param callback
 */
Subscription.getDevice = function(id, callback) {
	var key = 'blg:devices:'+id;

	Application.redisClient.get(key, function(err, result) {
		if (err) return callback(err);

		if (result === null)
			return callback(new Error('Device with ID "'+id+'" does not exist'));

		callback(null, JSON.parse(result));
	});
};

/**
 * Gets multiple devices
 * @param ids string[] Array of device IDs
 * @param callback
 */
Subscription.multiGetDevices = function(ids, callback) {
	var baseKey = 'blg:devices:';

	if (!ids.length) return callback(null, []);
	async.map(ids, function(item, c){
		c(null, baseKey+item);
	}, function(err1, results) {
		Application.redisClient.mget(results, function(err, results1) {
			if (err) return callback(err);

			var allDevices = {};

			async.map(results1, function(deviceItem, c2) {
				c(null, JSON.parse(deviceItem));
			}, function(err2, parsedDevices) {
				parsedDevices.forEach(function(item) {
					allDevices[item.id] = item;
				});

				callback(null, allDevices);
			});
		});
	});
};

Subscription.findDeviceByUdid = function(udid, callback) {
	var udidkey = 'blg:devices:udid'+udid;
	Application.redisClient.get(udidkey, callback);
};

/**
 * Gets all the devices.
 * @param callback
 */
Subscription.getAllDevices = function(callback) {
	//var query = cb.ViewQuery.from('dev_state_document', 'all_devices').custom({stale: false, inclusive_end: true});

	Application.redisClient.scan([0, 'MATCH', 'blg:devices:*', 'COUNT', 100000], function(err, results) {
		if (err) return callback(err);
		async.map(results, function(device, c) {
			c(JSON.parse(device));
		}, callback);
	});

	/*Application.stateBucket.query(query, function(err, results) {
		if (err) return callback(err);

		async.each(results, function(item, c) {
			devices.push(item.value);
		}, function(err) {
			callback(null, devices);
		});
	});*/
}

/**
 * Gets current devices of the user.
 * @param id integer user ID
 * @param callback
 */
Subscription.getUserDevices = function(id, callback) {
	User.User(id, function(err, result) {
		if (err) return callback(err);

		var devices = result.devices || [];
		callback(null, devices);
	});
}

Subscription.getDeviceSubscriptions = function(id, callback) {
	Subscription.getDevice(id, function(err, result) {
		if (err) return callback(err);

		var subscriptions = result.subscriptions || [];
		callback(null, subscriptions);
	});
}

/**
 * Updates a device
 * @param deviceUpdates Object Device properties (must include 'id').
 * @param callback
 */
Subscription.updateDevice = function(device, props, callback) {
	var key = null;

	if (props) {
		key = 'blg:devices:'+device;

		Subscription.getDevice(device, function(err, dev) {
			if (err) return callback(err);

			for(var p in props) {
				dev[p] = props[p];
			}

			Application.redisClient.set(key, JSON.stringify(dev), callback);
		});
	} else {
		key = 'blg:devices:'+device.id;
		Application.redisClient.set(key, JSON.stringify(device), callback);
	}

	/*async.waterfall([
		function Update(result, callback1) {
			async.each(Object.keys(device), function(d, c) {
				result[d] = device[d];
				c();
			}, function() {
				Application.stateBucket.replace(key, result, callback);
			});
		}
	], callback);*/
}

/**
 *
 * @param {Channel} channel
 * @param calllback
 */
Subscription.getSubscriptionKeysWithFilters = function(channel, callback) {
	//var query = cb.ViewQuery.from('dev_state_document', 'by_subscription').custom({stale: false, key: '"'+channel.get()+'"'});
	var filterChannels = [];
	Application.redisClient.scan([0, 'MATCH', channel.get()+':filter:*', 'COUNT', 100000], function(err, results) {
		if (err) return callback(err);
		var subscriptionKeys = results[1];

		for(var k in subscriptionKeys) {
			//last part of the key is either 'deltas' or the base64-encoded filter object
			var lastKeyPart = subscriptionKeys[k].split(':').pop();
			if (lastKeyPart == 'deltas')
				continue;

			//the base64 encoded filter object is at the end of the key name, after ':filter:'
			var queryObject = JSON.parse((new Buffer(lastKeyPart, 'base64')).toString('utf-8'));

			filterChannels.push(channel.clone().setFilter(queryObject));
		}
		callback(null, filterChannels);
	});
};

module.exports = Subscription;
