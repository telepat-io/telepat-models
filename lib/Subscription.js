var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');
var User = require('./User');

function Subscription() {};

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

Subscription.add = function(appId, context, deviceId, channel, user_id, parent, callback) {
	var key = 'blg:'+context+':'+Application.loadedAppModels[appId][channel.model].namespace;

	if (channel.id)
		key += ':'+channel.id;

	if (user_id)
		key += ':users:'+user_id;
	if (parent.model)
		key += ':'+parent.model+':'+parent.id;

	async.waterfall([
		function(callback1) {
			Application.stateBucket.get(key, function(err, results) {
				if (err && err.code == cb.errors.keyNotFound)
					return callback1(null, null);

				var devices = JSON.parse('[' + results.value.slice(0, -1) + ']');

				if (devices.indexOf(deviceId) !== -1)
					return callback1(true, null);

				callback1(err, results);
			});
		},
		function(results, callback1) {
			if (results)
				Application.stateBucket.append(key, '"'+deviceId.toString()+'",', callback1);
			else
				Application.stateBucket.insert(key, '"'+deviceId.toString()+'",', callback1);

		}
	], function(err, results) {
		//if err == true it means deviceID already exists in the key
		if (err !== true && err !== null)
			return callback(err, null);

		callback(null, results);
	});
};

Subscription.getObjectCount = function(appId, context, channel, user_id, parent, callback) {
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

Subscription.setObjectCount = function(appId, context, channel, user_id, parent, count, callback) {
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

	key += '_object_count';

	Application.stateBucket.upsert(key, count, callback);
}

Subscription.incrementObjectCount = function(appId, context, channel, user_id, parent, delta, callback) {
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

	key += '_object_count';

	Application.stateBucket.counter(key, count, callback);
}

Subscription.addDevice = function(device, callback) {
	var key = 'blg:devices:'+device.id;

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

Subscription.getDevice = function(id, callback) {
	var key = 'blg:devices:'+id;

	Application.stateBucket.get(key, callback);
};

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

Subscription.getUserDevices = function(id, callback) {
	var key = 'blg:'+User._model.namespace+':'+id;

	User.User(id, function(err, result) {
		if (err) return callback(err);

		var devices = result.devices || [];
		callback(null, devices);
	});
}

Subscription.updateDevice = function(deviceUpdates, callback) {
	var key = 'blg:devices:'+deviceUpdates.id;

	async.waterfall([
		function(callback1) {
			Subscription.getDevice(deviceUpdates.id, callback1);
		},
		function(result, callback1) {
			var device = result.value;
			for(var p in deviceUpdates) {
				if (deviceUpdates.hasOwnProperty(p)) {
					device[p] = deviceUpdates[p];
				}
			}
			Application.stateBucket.replace(key, device, callback1);
		}
	], callback);
}

module.exports = Subscription;
