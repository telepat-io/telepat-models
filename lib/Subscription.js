var Application = require('./Application');
var async = require('async');
var User = require('./User');
var utils = require('../utils/utils');
var TelepatError = require('./TelepatError');

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
Subscription.add = function(appId, deviceId, channel, callback) {
	async.waterfall([
		function(callback1) {
			Application.redisClient.sadd([channel.get(), deviceId+'|'+appId], callback1);
		},
		function(results, callback1) {
			Subscription.getDevice(appId, deviceId, callback1);
		},
		function(results, callback1) {
			results.subscriptions = results.subscriptions || [];

			if (results.subscriptions.indexOf(channel.get()) === -1) {
				results.subscriptions.push(channel.get());
				Subscription.updateDevice(appId, deviceId, results, callback1);
			} else {
				callback1();
			}
		}
	], callback);
};

/**
 * Adds a new inactive device.
 * @param device Object The device properties
 * @param callback
 */
Subscription.addDevice = function(device, callback) {
	var key = '';

	if (device.volatile)
		key = 'blg:'+device.application_id+':inactive_devices:'+device.id;
	else
		key = 'blg:'+device.application_id+':devices:'+device.id;

	device.subscriptions = device.subscriptions || [];

	async.parallel([
		function(callback1) {
			if (device.info && device.info.udid) {
				var udidKey = 'blg:'+device.application_id+':devices:udid:'+device.info.udid;
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
Subscription.remove = function(appId, deviceId, channel, callback){
	if (typeof channel != 'string')
		channel = channel.get();

	async.waterfall([
		function(callback1) {
			Subscription.getDevice(appId, deviceId, callback1);
		},
		function(device, callback1) {
			var idx = device.subscriptions.indexOf(channel);
			if (idx !== -1) {
				device.subscriptions.splice(idx, 1);

				Subscription.updateDevice(appId, deviceId, device, callback1);
			} else {
				callback1(null, false);
			}
		},
		function(result, callback1) {
			Application.redisClient.srem([channel, deviceId+'|'+appId], callback1);
		},
		function(removed, callback1) {
			if (removed == 0) {
				return callback1(new TelepatError(TelepatError.errors.SubscriptionNotFound));
			}
			callback1();
		}
	], callback);
};

Subscription.removeAllSubscriptionsFromDevice = function(appId, deviceId, callback) {
	var deviceSubscriptions = [];

	async.waterfall([
		function(callback1) {
			Subscription.getDevice(appId, deviceId, callback1);
		},
		function(device, callback1) {
			deviceSubscriptions = deviceSubscriptions.concat(device.subscriptions);
			device.subscriptions = [];

			Subscription.updateDevice(appId, deviceId, device, callback1);
		},
		function(result, callback1) {
			var transaction = Application.redisClient.multi();

			deviceSubscriptions.forEach(function(subscription) {
				transaction.srem([subscription, deviceId+'|'+appId]);
			});

			transaction.exec(callback1);
		}
	], callback);
};

/**
 * Gets a device.
 * @param id string Device ID
 * @param callback
 */
Subscription.getDevice = function(appId, id, callback) {
	var key = 'blg:'+appId+':devices:'+id;

	Application.redisClient.get(key, function(err, result) {
		if (err) return callback(err);

		if (result === null) {
			var inactiveDeviceKey = 'blg:'+appId+':inactive_devices:'+id;
			Application.redisClient.get(inactiveDeviceKey, function(err1, result1) {
				if (err1)
					return callback(err1);
				if (!result1)
					return callback(new TelepatError(TelepatError.errors.DeviceNotFound, [id]));

				callback(null, JSON.parse(result1));
			});
		} else {
			callback(null, JSON.parse(result));
		}
	});
};

Subscription.removeDevice = function(appId, id, callback) {
	var key = 'blg:'+appId+':devices:'+id;

	Application.redisClient.del(key, function(err, result) {
		if (err) return callback(err);

		if (!result) {
			var inactiveDeviceKey = 'blg:'+appId+':inactive_devices:'+id;

			Application.redisClient.del(inactiveDeviceKey, function(err1, result1) {
				if (err1)
					return callback(err1);
				if (!result1)
					return callback(new TelepatError(TelepatError.errors.DeviceNotFound, [id]));

				callback();
			});
		}

		callback();
	});
};

/**
 * Gets multiple active devices
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
				if (deviceItem)
					c2(null, JSON.parse(deviceItem));
				else
					c2();
			}, function(err2, parsedDevices) {
				parsedDevices.forEach(function(item) {
					if (item)
						allDevices[item.id] = item;
				});

				callback(null, allDevices);
			});
		});
	});
};

Subscription.findDeviceByUdid = function(appId, udid, callback) {
	var udidkey = 'blg:'+appId+':devices:udid:'+udid;
	Application.redisClient.get(udidkey, callback);
};

/**
 * Gets all the devices.
 * @param callback
 */
Subscription.getAllDevices = function(appId, callback) {
	scanRedisKeysPattern('blg:'+appId+':devices:[^udid]*', function(err, results) {
		if (err) return callback(err);

		Application.redisClient.mget(results, function(err, results) {
			async.map(results, function(deviceItem, c) {
				if (deviceItem)
					c(null, JSON.parse(deviceItem));
				else
					c();
			}, function(err2, parsedDevices) {
				callback(null, parsedDevices);
			});
		});
	});
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
Subscription.updateDevice = function(appId, device, props, callback) {
	var key = 'blg:'+appId+':devices:'+device;

	Subscription.getDevice(appId, device, function(err, dev) {
		if (err) return callback(err);

		for(var p in props) {
			dev[p] = props[p];
		}

		Application.redisClient.set([key, JSON.stringify(dev), 'XX'], function(err1, result) {
			if (err1) return callback(err1);

			if (!result) {
				var inactiveDeviceKey = 'blg:'+appId+':inactive_devices:'+device;

				Application.redisClient.set([inactiveDeviceKey, JSON.stringify(dev)], callback);
			} else
				callback();
		});
	});
}

Subscription.deactivateDevice = function(appId, deviceId, callback) {
	var key = 'blg:'+appId+':devices:'+deviceId;

	Application.redisClient.rename([key, 'blg:'+appId+':inactive_devices:'+deviceId], callback);
};

Subscription.activateDevice = function(appId, deviceId, callback) {
	var key = 'blg:'+appId+':inactive_devices:'+deviceId;

	Application.redisClient.rename([key, 'blg:'+appId+':devices:'+deviceId], callback);
};

/**
 *
 * @param {Channel} channel
 * @param calllback
 */
Subscription.getSubscriptionKeysWithFilters = function(channel, callback) {
	var filterChannels = [];
	scanRedisKeysPattern(channel.get()+':filter:*[^:deltas]', function(err, results) {
		if (err) return callback(err);

		for(var k in results) {
			//last part of the key is the base64-encoded filter object
			var lastKeyPart = results[k].split(':').pop();

			//the base64 encoded filter object is at the end of the key name, after ':filter:'
			var queryObject = JSON.parse((new Buffer(lastKeyPart, 'base64')).toString('utf-8'));

			filterChannels.push(channel.clone().setFilter(queryObject));
		}
		callback(null, filterChannels);
	});
};

var scanRedisKeysPattern = function(pattern, callback) {
	var redisScanCursor = -1;
	var results = [];
	var getDeviceIds = function(callback1) {
		Application.redisClient.scan([redisScanCursor == -1 ? 0 : redisScanCursor,
			'MATCH', pattern, 'COUNT', 100000], function(err, partialResults) {
			if (err) return callback1(err);

			redisScanCursor = partialResults[0];
			results = results.concat(partialResults[1]);

			callback1();
		});
	};

	async.during(
		function(callback1) {
			callback1(null, redisScanCursor != 0);
		},
		getDeviceIds,
		function(err) {
			callback(err, results);
		}
	);
};

module.exports = Subscription;
