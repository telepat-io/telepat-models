var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');
var User = require('./User');
var utils = require('../utils/utils');

function Subscription() {};

/**
 * Get the subscribed devices of a filtered channel
 * @param appId integer Application ID
 * @param channel Object object that contains model name and id
 * @param filters Object filter that contains user ID and and an object of parent (model & id)
 * @param callback
 */
Subscription.getSubscribedDevices = function(appId, channel, filters, callback) {
	var key = Subscription.getSubscriptionKey(appId, channel, filters);

	Application.stateBucket.get(key, function(err, results) {
		if (!err)
			results = JSON.parse('['+results.value.slice(0, -1)+']');

		callback(err, results);
	});
};

/**
 * Adds a subscription
 * @param appId integer Application ID
 * @param deviceId string Device ID
 * @param channel Object object that contains model name and id, user and parent {id, model}
 * @param [extraFilters] Object object containing extra filters
 * @param callback
 */
Subscription.add = function(appId, deviceId, channel, extraFilters, callback) {
	var key = Subscription.getSubscriptionKey(appId, channel, extraFilters);

	async.waterfall([
		function(callback1) {
			Application.stateBucket.get(key, function(err, results) {
				if (err && err.code == cb.errors.keyNotFound)
					return callback1(null, false);
				else if (err)
					return callback1(err, null);

				var idx = results.value.indexOf('"'+deviceId+'"');

				if (idx > -1) {
					var error = new Error("This device is already subscribed to this channel");
					error.status = 409;

					return callback1(error, null);
				}

				callback1(null, true);
			});
		},
		function(results, callback1) {
			if (results !== false)
				Application.stateBucket.append(key, '"'+deviceId.toString()+'",', callback1);
			else
				Application.stateBucket.insert(key, '"'+deviceId.toString()+'",', callback1);
		},
		function(results, callback1) {
			Subscription.getDevice(deviceId, callback1);
		},
		function(results, callback1) {
			results.subscriptions = results.subscriptions || [];
			results.subscriptions.push(key);
			Subscription.updateDevice(results, callback1);
		}
	], callback);
};

Subscription.getSubscriptionKey = function(appId, channel, extraFilters) {
	var key = 'blg:'+channel.context+':'+Application.loadedAppModels[appId][channel.model].namespace;

	if (channel.id)
		key += ':'+channel.id;

	if (channel.user)
		key += ':users:'+user;
	if (channel.parent)
		key += ':'+channel.parent.model+':'+channel.parent.id;

	if (extraFilters)
		key += (new Buffer(JSON.stringify(utils.parseQueryObject(extraFilters)))).toString('base64');

	return key;
}

/**
 * The object count of the subscribed channel
 * @param appId integer Application ID
 * @param channel Object object that contains model name, id and user id and parent {id, model}
 * @param [extraFilters] Object object containing extra filters
 * @param callback
 */
Subscription.getObjectCount = function(appId, channel, extraFilters, callback) {
	//todo getObjectCount with elastic
}

/**
 * Adds a new device
 * @param device Object The device properties
 * @param callback
 */
Subscription.addDevice = function(device, callback) {
	var key = 'blg:devices:'+device.id;

	device.subscriptions = [];

	Application.stateBucket.insert(key, device, callback);

	/*async.parallel([
		function(callback1) {
			Application.stateBucket.insert(key, JSON.stringify(device), callback1);
		},
		function(callback1) {
			Application.stateBucket.append(userKey, '"'+device.id+'",', function(err1, results1) {
				if (err1 && err1.code == cb.errors.notStored) {
					Application.stateBucket.insert(userKey, '"'+device.id+'",', callback1);
				} else {
					return callback1(err1, null);
				}
			});
		}
	], callback);*/
};

/**
 * Removes the subscription
 * @param context integer Context ID
 * @param deviceId string Device ID
 * @param channel Object object that contains model name and id
 * @param filters Object filter that contains user ID and and an object of parent (model & id)
 * @param callback
 */
Subscription.remove = function(appId, deviceId, channel, filters, callback){
	var key = Subscription.getSubscriptionKey(appId, channel, filters);

	async.waterfall([
		function(callback) {
			Subscription.getDevice(deviceId, callback);
		},
		function(device, callback) {
			var idx = device.subscriptions.indexOf(key);
			device.subscriptions.splice(idx, 1);

			Subscription.updateDevice(device, callback);
		},
		function(result, callback1) {
			Application.stateBucket.getAndLock(key, callback1);
		},
		function(results, callback1) {
			var devices = results.value;
			var idx = devices.indexOf('"'+deviceId+'",');

			if (idx === -1) {
				Application.stateBucket.unlock(key, results.cas, function(err1, results1) {
					if (err1) return callback(err1, null);

					err1 = new Error('Subscription not found');
					err1.code = cb.errors.keyNotFound;
					callback1(err1, null);
				});
			} else {
				devices = devices.replace('"'+deviceId+'",', '');

				Application.stateBucket.replace(key, devices, {cas: results.cas}, callback1);
			}
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

	Application.stateBucket.get(key, function(err, result) {
		if (err) return callback(err);

		callback(null, result.value);
	});
};

/**
 * Gets multiple devices
 * @param ids string[] Array of device IDs
 * @param callback
 */
Subscription.multiGetDevices = function(ids, callback) {
	var baseKey = 'blg:devices:';

	async.map(ids, function(item, c){
		c(null, baseKey+item);
	}, function(cb1, results) {
		Application.stateBucket.getMulti(results, function(err, results1) {
			var allDevices = {};
			if(!err) {
				for(var m in results1) {
					var deviceId = m.split(':').slice(-1)[0];
					allDevices[deviceId] = results1[m].value;
				}
			}

			callback(err, allDevices);
		});
	});
};

/**
 * Gets all the devices.
 * @param callback
 */
Subscription.getAllDevices = function(callback) {
	var query = cb.ViewQuery.from('dev_state_document', 'all_devices').custom({stale: false, inclusive_end: true});
	var devices = [];

	Application.stateBucket.query(query, function(err, results) {
		if (err) return callback(err);

		async.each(results, function(item, c) {
			devices.push(item.value);
		}, function(err) {
			callback(null, devices);
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
Subscription.updateDevice = function(device, callback) {
	var key = 'blg:devices:'+device.id;

	Application.stateBucket.replace(key, device, callback);
}

module.exports = Subscription;
