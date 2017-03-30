var Application = require('./Application');
var async = require('async');
var User = require('./User');
var utils = require('../utils/utils');
var TelepatError = require('./TelepatError');
var objectMerge = require('object-merge');

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
	var device = null;

	async.series([
		function(callback1) {
			Subscription.getDevice(appId, deviceId, function(err, result) {
				if (err) return callback(result);

				device = result;
				callback1();
			});
		},
		function(callback1) {
			var transportType = '';
			var token = '';

			if (device.volatile && device.volatile.active) {
				transportType = device.volatile.server_name;
				token = device.volatile.token;

				if (!transportType || !token)
					return callback1(new TelepatError(TelepatError.errors.DeviceInvalid, [deviceId, 'volatile server_name or token is missing']));

			} else {
				if (!device.persistent || !device.persistent.type || !device.persistent.token)
					return callback1(new TelepatError(TelepatError.errors.DeviceInvalid, [deviceId, 'persistent type and/or token is missing']));
				transportType = device.persistent.type+'_transport';
				token = device.persistent.token;
			}

			Application.redisClient.sadd([channel.get(), transportType+'|'+deviceId+'|'+token+'|'+appId], callback1);
		},
		function(callback1) {
			var deviceSubscriptionsKey = 'blg:' + appId + ':device:' + deviceId + ':subscriptions';

			Application.redisClient.sadd([deviceSubscriptionsKey, channel.get()], callback1);
		}
	], callback);
};

/**
 * Adds a new inactive device.
 * @param device Object The device properties
 * @param callback
 */
Subscription.addDevice = function(device, callback) {
	var key = 'blg:'+device.application_id+':devices:'+device.id;

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
 * @param {string|undefined} [token]
 * @param callback
 */
Subscription.remove = function(appId, deviceId, channel, token, callback){
	if (typeof channel != 'string')	{
		channel = channel.get();
	}

	if (typeof token === 'function') {
		callback = token;
		token = undefined;
	}

	var removed = 0;
	var device = null;

	async.series([
		function(callback1) {
			Subscription.getDevice(appId, deviceId, function(err, result) {
				if (err) return callback1(err);

				device = result;
				callback1();
			});
		},
		function(callback1) {
			var deviceSubscriptionsKey = 'blg:' + appId + ':device:' + deviceId + ':subscriptions';

			Application.redisClient.srem([deviceSubscriptionsKey, channel], callback1);
		},
		function(callback1) {
			var transportType = '';

			if (!token) {
				if (device.volatile && device.volatile.active) {
					token = device.volatile.token;
				} else {
					token = device.persistent.token;
				}
			}

			if (device.volatile && device.volatile.active) {
				transportType = device.volatile.server_name;
			} else {
				transportType = device.persistent.type + '_transport';
			}

			Application.redisClient.srem([channel, transportType+'|'+deviceId+'|'+token+'|'+appId], function(err, result) {
				if (err) return callback1(err);

				removed = result;
				callback1();
			});
		},
		function(callback1) {
			if (removed == 0) {
				return callback1(new TelepatError(TelepatError.errors.SubscriptionNotFound));
			}
			callback1();
		}
	], callback);
};

Subscription.removeAllSubscriptionsFromDevice = function(appId, deviceId, token, transport, callback) {
	var device = null,
		subscriptions = [];

	if (!transport || typeof transport !== 'string') {
		return callback(new TelepatError(TelepatError.errors.UnspecifiedError, ['removeAllSubscriptionsFromDevice: need to specify transport']));
	}

	async.series([
		function(callback1) {
			Subscription.getDeviceSubscriptions(appId, deviceId, function(err, results) {
				if (err) {
					return callback1(err);
				}

				subscriptions = results;
				callback1();
			});
		},
		function(callback1) {
			if (!subscriptions.length) {
				return callback1();
			}

			var transaction = Application.redisClient.multi();

			subscriptions.forEach(function(subscription) {
				transaction.srem([subscription, transport+'|'+deviceId+'|'+token+'|'+appId]);
			});

			transaction.exec(callback1);
		}
	], function(err) {
		callback(err, subscriptions);
	});
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
			return callback(new TelepatError(TelepatError.errors.DeviceNotFound, [id]));
		}

		callback(null, JSON.parse(result));
	});
};

Subscription.getDeviceSubscriptions = function(appId, deviceId, callback) {
	var deviceSubscriptionsKey = 'blg:' + appId + ':device:' + deviceId + ':subscriptions';

	Application.redisClient.smembers([deviceSubscriptionsKey], callback);
};

Subscription.removeDevice = function(appId, id, callback) {
	var keys = ['blg:'+appId+':devices:'+id];
	keys.push('blg:'+appId+':device:'+ id +':subscriptions');

	Application.redisClient.del(keys, function(err, result) {
		if (err) return callback(err);

		if (result === null || result === 0) {
			return callback(new TelepatError(TelepatError.errors.DeviceNotFound, [id]));
		}

		callback();
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
	utils.scanRedisKeysPattern('blg:'+appId+':devices:[^udid]*', Application.redisClient, function(err, results) {
		if (err) return callback(err);

		Application.redisClient.mget(results, function(err, results) {
			var devices = {};

			async.each(results, function(result, c) {
				if (result) {
					var parsedDevice = JSON.parse(result);

					if (parsedDevice.volatile && parsedDevice.volatile.active) {
						if (!devices[parsedDevice.volatile.server_name])
							devices[parsedDevice.volatile.server_name] = [parsedDevice.id + '|' +parsedDevice.volatile.token];
						else
							devices[parsedDevice.volatile.server_name].push(parsedDevice.id + '|' +parsedDevice.volatile.token);

					} else if(parsedDevice.persistent) {
						var queueName = parsedDevice.persistent.type+'_transport';

						if (!devices[queueName])
							devices[queueName] = [parsedDevice.id + '|' +parsedDevice.persistent.token];
						else
							devices[queueName].push(parsedDevice.id + '|' +parsedDevice.persistent.token);
					}
				}
				c();
			}, function() {
				callback(null, devices);
			});
		});
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

		var newDevice = objectMerge(dev, props);

		Application.redisClient.set([key, JSON.stringify(newDevice), 'XX'], callback);
	});
}

/**
 *
 * @param {Channel} channel
 * @param calllback
 */
Subscription.getSubscriptionKeysWithFilters = function(channel, callback) {
	var filterChannels = [];
	utils.scanRedisKeysPattern(channel.get()+':filter:*[^:count_cache:LOCK]', Application.redisClient, function(err, results) {
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

module.exports = Subscription;
