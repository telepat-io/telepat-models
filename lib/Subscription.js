var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

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

Subscription.add = function(context, deviceId, channel, filters, callback) {
	var key = 'blg:'+context+':'+channel.model;

	if (channel.id)
		key += ':'+channel.id;

	if(filters) {
		if (filters.user)
			key += ':users:'+filters.user;
		if (filters.parent)
			key += ':'+filters.parent.model+':'+filters.parent.id;
	}

	Application.stateBucket.append(key, '"'+deviceId.toString()+'",', function(err, results) {
		if (err.code == cb.errors.notStored) {
			Application.stateBucket.insert(key, '"'+deviceId.toString()+'",', callback);
		} else if (err) {
			return callback(err, null);
		}
	});
};

Subscription.addDevice = function(device, callback) {
	var key = 'blg:devices:'+device.id;
	var userKey = 'blg:users:'+device.user_id+':devices';

	Application.stateBucket.insert(key, JSON.stringify(device), function(err, results) {
		if (err) return callback(err, null);

		Application.stateBucket.append(userKey, '"'+device.id+'",', function(err1, results1) {
			if (err1.code == cb.errors.notStored) {
				Application.stateBucket.insert(userKey, '"'+device.id+'",', callback);
			} else {
				return callback(err1, null);
			}
		});
	});
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
				Application.bucket.unlock(key, results.cas, callback);

				return;
			}

			Application.stateBucket.replace(key, devices.splice(idx, 1).toString()+',', function(err1, results1) {
				Application.bucket.unlock(key, results.cas, callback);
			});
		} else {
			callback(err, results);
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

Subscription.getUserDevices = function(id, callback) {
	var key = 'blg:users:'+id+':devices';

	Application.stateBucket.get(key, function(err, results) {
		if (!err)
			results = JSON.parse('['+results.value.slice(0, -1)+']');

		callback(err, results);
	});
}

module.exports = Subscription;
