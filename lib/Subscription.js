let async = require('async');
let utils = require('../utils/utils');
let TelepatError = require('./TelepatError');
let objectMerge = require('object-merge');
let Services = require('./Services');

class Subscription {
	/**
     * Get the subscribed devices of a filtered channel
     * @param channel {Channel} object that contains model name and id
     * @param callback
     */
	static getSubscribedDevices(channel, callback) {
		Services.redisClient.smembers(channel.get(), callback);
	}

	/**
     * Adds a subscription
     * @param deviceId string Device ID
     * @param channel {Channel} object that contains model name and id, user and parent {id, model}
     * @param callback
     */
	static add(appId, deviceId, channel, callback) {
		let device = null;

		async.series([
			callback1 => {
				Subscription.getDevice(appId, deviceId, (err, result) => {
					if (err) {
						return callback(result);
					}

					device = result;
					callback1();
				});
			},
			callback1 => {
				let transportType = '';
				let token = '';

				if (device.volatile && device.volatile.active) {
					transportType = device.volatile.server_name;
					token = device.volatile.token;

					if (!transportType || !token)
						return callback1(new TelepatError(TelepatError.errors.DeviceInvalid, [deviceId, 'volatile server_name or token is missing']));

				} else {
					if (!device.persistent || !device.persistent.type || !device.persistent.token)
						return callback1(new TelepatError(TelepatError.errors.DeviceInvalid, [deviceId, 'persistent type and/or token is missing']));
					transportType = `${device.persistent.type}_transport`;
					token = device.persistent.token;
				}

				Services.redisClient.sadd([channel.get(), `${transportType}|${deviceId}|${token}|${appId}`], callback1);
			},
			callback1 => {
				let deviceSubscriptionsKey = `blg:${appId}:device:${deviceId}:subscriptions`;

				Services.redisClient.sadd([deviceSubscriptionsKey, channel.get()], callback1);
			}
		], callback);
	}

	/**
     * Adds a new inactive device.
     * @param device Object The device properties
     * @param callback
     */
	static addDevice(device, callback) {
		let key = `blg:${device.application_id}:devices:${device.id}`;

		async.parallel([
			callback1 => {
				if (device.info && device.info.udid) {
					let udidKey = `blg:${device.application_id}:devices:udid:${device.info.udid}`;
					Services.redisClient.set(udidKey, device.id, callback1);
				} else
					callback1();

			},
			callback1 => {
				Services.redisClient.set(key, JSON.stringify(device), callback1);
			}
		], callback);
	}

	/**
     * Removes the subscription
     * @param context integer Context ID
     * @param deviceId string Device ID
     * @param channel Object object that contains model name and id
     * @param filters Object filter that contains user ID and and an object of parent (model & id)
     * @param {string|undefined} [token]
     * @param callback
     */
	static remove(appId, deviceId, channel, token, callback) {
		if (typeof channel !== 'string')	{
			channel = channel.get();
		}

		if (typeof token === 'function') {
			callback = token;
			token = undefined;
		}

		let removed = 0;
		let device = null;

		async.series([
			callback1 => {
				Subscription.getDevice(appId, deviceId, (err, result) => {
					if (err) { 
						return callback1(err);
					}

					device = result;
					callback1();
				});
			},
			callback1 => {
				let deviceSubscriptionsKey = `blg:${appId}:device:${deviceId}:subscriptions`;

				Services.redisClient.srem([deviceSubscriptionsKey, channel], callback1);
			},
			callback1 => {
				let transportType = '';

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
					transportType = `${device.persistent.type}_transport`;
				}

				Services.redisClient.srem([channel, `${transportType}|${deviceId}|${token}|${appId}`], (err, result) => {
					if (err) {
						return callback1(err);
					}

					removed = result;
					callback1();
				});
			},
			callback1 => {
				if (removed == 0) {
					return callback1(new TelepatError(TelepatError.errors.SubscriptionNotFound));
				}
				callback1();
			}
		], callback);
	}

	static removeAllSubscriptionsFromDevice(appId, deviceId, token, transport, callback) {
		let subscriptions = [];

		if (!transport || typeof transport !== 'string') {
			return callback(new TelepatError(TelepatError.errors.UnspecifiedError, ['removeAllSubscriptionsFromDevice: need to specify transport']));
		}

		async.series([
			callback1 => {
				Subscription.getDeviceSubscriptions(appId, deviceId, (err, results) => {
					if (err) {
						return callback1(err);
					}

					subscriptions = results;
					callback1();
				});
			},
			callback1 => {
				if (!subscriptions.length) {
					return callback1();
				}

				let transaction = Services.redisClient.multi();

				subscriptions.forEach(subscription => {
					transaction.srem([subscription, `${transport}|${deviceId}|${token}|${appId}`]);
				});

				transaction.exec(callback1);
			}
		], err => {
			callback(err, subscriptions);
		});
	}

	/**
     * Gets a device.
     * @param id string Device ID
     * @param callback
     */
	static getDevice(appId, id, callback) {
		let key = `blg:${appId}:devices:${id}`;

		Services.redisClient.get(key, (err, result) => {
			if (err) {
				return callback(err);
			}

			if (result === null) {
				return callback(new TelepatError(TelepatError.errors.DeviceNotFound, [id]));
			}

			callback(null, JSON.parse(result));
		});
	}

	static getDeviceSubscriptions(appId, deviceId, callback) {
		let deviceSubscriptionsKey = `blg:${appId}:device:${deviceId}:subscriptions`;

		Services.redisClient.smembers([deviceSubscriptionsKey], callback);
	}

	static removeDevice(appId, id, callback) {
		let keys = [`blg:${appId}:devices:${id}`];
		keys.push(`blg:${appId}:device:${id}:subscriptions`);

		Services.redisClient.del(keys, (err, result) => {
			if (err) {
				return callback(err);
			}

			if (result === null || result === 0) {
				return callback(new TelepatError(TelepatError.errors.DeviceNotFound, [id]));
			}

			callback();
		});
	}

	static findDeviceByUdid(appId, udid, callback) {
		let udidkey = `blg:${appId}:devices:udid:${udid}`;
		Services.redisClient.get(udidkey, callback);
	}

	/**
     * Gets all the devices.
     * @param callback
     */
	static getAllDevices(appId, callback) {
		utils.scanRedisKeysPattern(`blg:${appId}:devices:[^udid]*`, Services.redisClient, (err, results) => {
			if (err) {
				return callback(err);
			}

			Services.redisClient.mget(results, (err, results) => {
				let devices = {};

				async.each(results, (result, c) => {
					if (result) {
						let parsedDevice = JSON.parse(result);

						if (parsedDevice.volatile && parsedDevice.volatile.active) {
							if (!devices[parsedDevice.volatile.server_name])
								devices[parsedDevice.volatile.server_name] = [`${parsedDevice.id}|${parsedDevice.volatile.token}`];
							else
								devices[parsedDevice.volatile.server_name].push(`${parsedDevice.id}|${parsedDevice.volatile.token}`);

						} else if(parsedDevice.persistent) {
							let queueName = `${parsedDevice.persistent.type}_transport`;

							if (!devices[queueName])
								devices[queueName] = [`${parsedDevice.id}|${parsedDevice.persistent.token}`];
							else
								devices[queueName].push(`${parsedDevice.id}|${parsedDevice.persistent.token}`);
						}
					}
					c();
				}, () => {
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
	static updateDevice(appId, device, props, callback) {
		let key = `blg:${appId}:devices:${device}`;

		Subscription.getDevice(appId, device, (err, dev) => {
			if (err) {
				return callback(err);
			}
			let newDevice = objectMerge(dev, props);

			Services.redisClient.set([key, JSON.stringify(newDevice), 'XX'], callback);
		});
	}

	/**
     *
     * @param {Channel} channel
     * @param calllback
     */
	static getSubscriptionKeysWithFilters(channel, callback) {
		let filterChannels = [];
		utils.scanRedisKeysPattern(`${channel.get()}:filter:*[^:count_cache:LOCK]`, Services.redisClient, (err, results) => {
			if (err) {
				return callback(err);
			}
			for(let k in results) {
				//last part of the key is the base64-encoded filter object
				let lastKeyPart = results[k].split(':').pop();

				//the base64 encoded filter object is at the end of the key name, after ':filter:'
				let queryObject = JSON.parse((new Buffer(lastKeyPart, 'base64')).toString('utf-8'));

				filterChannels.push(channel.clone().setFilter(queryObject));
			}
			callback(null, filterChannels);
		});
	}
}

module.exports = Subscription;
