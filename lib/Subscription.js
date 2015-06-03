var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');
var User = require('./User');
var utils = require('../utils/utils');

function Subscription() {};

/**
 * Get the subscribed devices of a filtered channel
 * @param context integer Context ID
 * @param channel Object object that contains model name and id
 * @param filters Object filter that contains user ID and and an object of parent (model & id)
 * @param callback
 */
Subscription.getSubscribedDevices = function(context, channel, filters, callback) {
	var key = 'blg:'+context+':'+channel.model+':'+channel.id;

	if(filters) {
		if (filters.user)
			key += ':users:'+filters.user;
		if (filters.parent)
			key += ':'+filters.parent.model+':'+filters.parent.id;
	}

	Application.stateBucket.get(key, function(err, results) {
		if (!err)
			results = JSON.parse('['+results.value.slice(0, -1)+']');

		callback(err, results);
	});
};

/**
 * Adds a subscription
 * @param appId integer Application ID
 * @param context integer Context ID
 * @param deviceId string Device ID
 * @param channel Object object that contains model name and id
 * @param user_id integer User ID
 * @param parent Object object that contains the parent model name and id
 * @param [extraFilters] Object object containing extra filters
 * @param callback
 */
Subscription.add = function(appId, context, deviceId, channel, user_id, parent, extraFilters, callback) {
	var key = Subscription.getSubscriptionKey(appId, context, deviceId, channel, user_id, parent, extraFilters);

	async.waterfall([
		function(callback1) {
			Application.stateBucket.get(key, function(err, results) {
				if (err && err.code == cb.errors.keyNotFound)
					return callback1(null, false);
				else if (err)
					return callback1(err, null);

				if (results.value.indexOf(deviceId) > -1) {
					var error = new Error("This device is already subscribed to this channel");
					error.status = 409;

					return callback1(error, null);
				}
				callback1(null, results);
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

Subscription.getSubscriptionKey = function(appId, context, deviceId, channel, user_id, parent, extraFilters) {
	var key = 'blg:'+context+':'+Application.loadedAppModels[appId][channel.model].namespace;

	if (channel.id)
		key += ':'+channel.id;

	if (user_id)
		key += ':users:'+user_id;
	if (parent)
		key += ':'+parent.model+':'+parent.id;

	if (extraFilters)
		key += (new Buffer(JSON.stringify(utils.parseQueryObject(extraFilters)))).toString('base64');

	return key;
}

/**
 * The object count of the subscribed channel
 * @param appId integer Application ID
 * @param context integer Context ID
 * @param channel Object object that contains model name and id
 * @param user_id integer User ID
 * @param parent Object object that contains the parent model name and id
 * @param [extraFilters] Object object containing extra filters
 * @param callback
 */
Subscription.getObjectCount = function(appId, context, channel, user_id, parent, extraFilters, callback) {
	var key = 'blg:';
	if (context)
		key += context+':'

	key += Application.loadedAppModels[appId][channel.model].namespace;
	if (channel.id)
		key += ':'+channel.id;

	if (user_id)
		key += ':users:'+user_id;
	if (parent)
		key += ':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;

	var itemsKey = key;

	if (extraFilters) {
		key += utils.getQueryKey(extraFilters);
	}

	key += '_object_count';

	async.waterfall([
		function(callback1) {
			Application.stateBucket.get(key, function(err, result) {
				if (err && err.code == cb.errors.keyNotFound) {
					callback1(null, false);
				} else if (err)
					callback1(err);
				else
					callback1(null, result);
			});
		},
		function(result, callback1) {
			if (result === false) {
				Application.bucket.get(itemsKey, function(err, result1) {
					if (err && err.code == cb.errors.keyNotFound)
						callback1(null, 0);
					else if (err)
						callback1(err);
					else {
						var objects = JSON.parse('['+result1.value.slice(0, -1)+']').length;
						callback1(null, objects);
					}
				});
			} else
				callback1(null, result);
		}
	], callback);
}

/**
 * Sets the object count that is yielded from the channel
 * @param appId integer Application ID
 * @param context integer Context ID
 * @param channel Object object that contains model name and id
 * @param user_id integer User ID
 * @param parent Object object that contains the parent model name and id
 * @param [extraFilters] Object object containing extra filters
 * @param count
 * @param callback
 */
Subscription.setObjectCount = function(appId, context, channel, user_id, parent, extraFilters, count, callback) {
	var key = 'blg:';
	if (context)
		key += context+':'

	key += Application.loadedAppModels[appId][channel.model].namespace;

	if (channel.id)
		key += ':'+channel.id;

	if (user_id)
		key += ':users:'+user_id;
	if (parent && parent.model)
		key += ':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;

	if (extraFilters) {
		key += utils.getQueryKey(extraFilters);
	}

	key += '_object_count';

	Application.stateBucket.upsert(key, count, callback);
}

/**
 * Increments or decrements the object count that is yielded from a channel with a value
 * @param appId integer Application ID
 * @param context integer Context ID
 * @param channel Object object that contains model name and id
 * @param user_id integer User ID
 * @param parent Object object that contains the parent model name and id
 * @param [extraFilters] Object object containing extra filters
 * @param delta number
 * @param callback
 */
Subscription.incrementObjectCount = function(appId, context, channel, user_id, parent, extraFilters, delta, callback) {
	var key = 'blg:';
	if (context)
		key += context+':'

	key += Application.loadedAppModels[appId][channel.model].namespace;

	if (channel.id)
		key += ':'+channel.id;

	if (user_id)
		key += ':users:'+user_id;
	if (parent.model)
		key += ':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;

	if (extraFilters) {
		key += utils.getQueryKey(extraFilters);
	}

	key += '_object_count';

	Application.stateBucket.counter(key, count, callback);
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
Subscription.remove = function(context, deviceId, channel, filters, callback){
	var key = 'blg:'+context+':'+channel.model;

	if (channel.id)
		key += ':'+channel.id;

	if(filters) {
		if (filters.user)
			key += ':users:'+filters.user;
		if (filters.parent)
			key += ':'+filters.parent.model+':'+filters.parent.id;
	}

	Application.stateBucket.getAndLock(key, function(err, results) {
		if (!err) {
			var devices = JSON.parse('[' + results.value.slice(0, -1) + ']');
			var idx = devices.indexOf(deviceId);

			if (idx === -1) {
				Application.stateBucket.unlock(key, results.cas, function(err1, results1) {
					if (err1) return callback(err1, null);

					err1 = new Error('Subscription not found');
					err1.code = cb.errors.keyNotFound;
					callback(err1, null);
				});

				return;
			}

			devices.splice(idx, 1);

			async.mapSeries(devices, function(item, callback1){
				callback1(null, '"'+item+'"');
			}, function(err2, results1) {
				if (!results1.length)
					results1 = "";
				else
					results1 = results1.toString()+',';
				Application.stateBucket.replace(key, results1, {cas: results.cas}, callback);
			});
		} else {
			callback(err);
		}
	});
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
