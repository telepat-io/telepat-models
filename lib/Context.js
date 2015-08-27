var Application = require('./Application');
var async = require('async');

/**
 * Gets a context object.
 * @param _id number Context ID
 * @param callback
 * @constructor
 */
function Context(_id, callback) {
	Application.bucket.get('blg:'+Context._model.namespace+':'+_id, (function(err, res) {
		if (!err) {
			var result = res.value;

			for(var prop in Context._model.properties) {
				if (Context._model.properties.hasOwnProperty(prop)) {
					this[prop] = result[prop];
				}
			}
		}

		callback(err, result);
	}).bind(this));
}

/**
 * Loads the configuration spec file. Automatically called at module require.
 */
Context.load = function() {
	Context._model = require('../models/context.json');

	if (!Context._model)
		throw new Error('Model spec file does not exist.');
};

Context.prototype.get = function(key) {
	if (this.hasOwnProperty(key))
		return this[key];

	return undefined;
};

/**
 * Get all contexts.
 * @param [by_app] integer Gets the context only from this application.
 * @param callback
 */
Context.getAll = function(by_app, callback) {
	if (by_app) {
		async.waterfall([
			function(callback1) {
				var key = 'blg:'+Application._model.namespace+':'+by_app+':contexts';
				Application.bucket.get(key, callback1);
			},
			function(results, callback1) {
				var appContexts = JSON.parse('['+results.value.slice(0, -1)+']');

				var baseKey = 'blg:'+Context._model.namespace+':';

				async.map(appContexts, function(item, c){
					c(null, baseKey+item);
				}, function(err, results1) {
					Application.bucket.getMulti(results1, function(err, results2) {
						var allContexts = [];
						if(!err) {
							for(var m in results2) {
								var contextId = results2[m].value.id;
								allContexts.push(results2[m].value);
							}
						}

						callback1(err, allContexts);
					});
				});
			}
		], function(err, result) {
			if (err && err.code == cb.errors.keyNotFound) {
				callback(null, {});
			} else if (err)
				callback(err);
			else
				callback(null, result);
		});
	}
	else {
		var query = cb.ViewQuery.from('dev_models', 'by_type').key('context').custom({ inclusive_end: true, stale: false });
		var allContexts = [];
		Application.bucket.query(query, function(err, results) {
			async.each(results, function(item, c){
				allContexts.push(item.value);
				c();
			}, function(err1) {
				callback(err, allContexts);
			});
		});
	}
}

/**
 * Gets the curent index of the contexts.
 * @param callback
 */
Context.count = function(callback) {
	var key = 'blg:'+Context._model.namespace+':count';

	Application.bucket.get(key, function(err, result) {
		if (err && err.code == cb.errors.keyNotFound) {
			Application.bucket.insert(key, 0, function(err1, result1) {
				if (err1) return callback(err1);

				callback(null, 0);
			});
		} else if (err) {
			callback(err);
		} else
			callback(null, result.value);
	});
}


/**
 * Creates a new context
 * @param props Object properties of the context
 * @param callback
 */
Context.create = function(props, callback) {
	var acceptedProps = {};
	var lookupKey = null;
	var idx = null;

	for(var prop in Context._model.properties) {
		if (Context._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	if (!acceptedProps.application_id) {
		var error = new Error('Application ID not provided');
		error.status = 400;
		console.trace('Application ID not provided');
		return callback(error);
	}

	acceptedProps.type = 'context';
	acceptedProps.state = 0;
	acceptedProps.meta = props.meta || {};

	async.waterfall([
		function(callback1) {
			Context.count(callback1);
		},
		function(result, callback1) {
			idx = result+1;
			var newKey = 'blg:'+Context._model.namespace+':'+idx;

			acceptedProps.id = idx;
			Application.bucket.insert(newKey, acceptedProps, callback1);
		},
		function(result, callback1) {
			lookupKey = 'blg:'+Application._model.namespace+':'+acceptedProps.application_id+':contexts';
			Application.bucket.getAndLock(lookupKey, function(err, result) {
				if (err && err.code == cb.errors.keyNotFound)
					callback1(null, null);
				else if (err)
					callback1(err);
				else
					callback1(null, result);
			});
		},
		function(result, callback1) {
			if (result == null) {
				Application.bucket.insert(lookupKey, idx+',', callback1);
			} else {
				var appContexts = JSON.parse('['+result.value.slice(0, -1)+']');
				appContexts.push(acceptedProps.id);
				Application.bucket.replace(lookupKey, appContexts.toString()+',', {cas: result.cas}, callback1);
			}
		}
	], function(err, result) {
		if (err) return callback(err);

		Context.increment(1, function(err2, result2) {
			if (err2) return callback(err2, result2);

			callback(null, acceptedProps);
		});
	});
}

/**
 * Increments the index of the contexts
 * @param delta integer The value to increase/decrease with
 * @param callback
 */
Context.increment = function(delta, callback) {
	var key = 'blg:'+Context._model.namespace+':count';

	Application.bucket.counter(key, delta, {initial: 1}, callback);
};

/**
 * Updates a context.
 * @param id integer Context ID
 * @param props Object The new properties of the context
 * @param callback
 */
Context.update = function(id, props, callback) {
	var key = 'blg:'+Context._model.namespace+':'+id;

	async.waterfall([
		function getContext(callback) {
			new Context(id, callback);
		},
		function update(contextItem, callback) {
			for(var i in props) {
				contextItem[i] = props[i];
			}
			Application.bucket.replace(key, contextItem, callback);
		}
	], callback);
}

/**
 * Deletes a context and all of its objects and subscriptions
 * @param id integer Context ID
 * @param callback
 */
Context.delete = function(id, callback) {
	id = parseInt(id);
	var appContextsKeys = null;
	var context = null;

	async.waterfall([
		//gets the context object
		function(callback1) {
			Context(id, function(err, result) {
				if (err) return callback1(err);
				context = result;
				callback1();
			});
		},
		//gets all items of the context
		function(callback1) {
			var query = cb.ViewQuery.from('dev_models', 'by_context').custom({inclusive_end: true, key: '"'+id+'"', stale: false});
			Application.bucket.query(query, function(err, results, num_rows) {
				if (err) return callback1(err);

				callback1(null, results);
			});
		},
		//and removes them
		function(results, callback1) {
			async.each(results, function(item, c) {
				Application.bucket.remove(item.id, function(err, result) {});
				c();
			}, callback1);
		},
		//gets the application contexts key
		function(callback1) {
			var appId = context.application_id;
			appContextsKeys = 'blg:'+Application._model.namespace+':'+appId+':contexts';
			Application.bucket.get(appContextsKeys, callback1);
		},
		//and removes the context from the application
		function(results, callback1) {
			var appContexts = JSON.parse('['+results.value.slice(0, -1)+']');
			var idx = appContexts.indexOf(id);

			if (idx !== -1) {
				appContexts.splice(idx, 1);
			} else
				return callback1(null, true);

			Application.bucket.replace(appContextsKeys, appContexts.toString()+',', callback1);
		},
		//removes the item document
		function(result, callback1) {
			var key = 'blg:'+Context._model.namespace+':'+id;
			Application.bucket.remove(key, callback1);
		},
		//gets subscription documents that have that context ID in the key
		function(result, callback1) {
			Application.redisClient.scan([0, 'MATCH', 'blg:'+id+':*', 'COUNT', 100000], function(err, results) {
				callback1(err, results[1]);
			});
		},
		function(subscriptionKeys, callback1) {
			if (!subscriptionKeys.length)
				return callback1(null, {});
			Application.redisClient.mget(subscriptionKeys, function (err, results) {
				if (err) return callback1(err);

				var subscriptionDevices = {};
				var i = 0;
				async.each(results, function (deviceKey, c) {
					if (deviceKey) {
						if (!subscriptionDevices[deviceKey])
							subscriptionDevices[deviceKey] = [subscriptionKeys[i]];
						else
							subscriptionDevices[deviceKey].push(subscriptionKeys[i]);
					}
					i++;
					c();
				}, function() {
					callback1(null, subscriptionDevices);
				});
			});
		},
		function(subscriptionDevices, callback1) {
			if (Object.getOwnPropertyNames(subscriptionDevices).length === 0)
				return callback1();

			async.each(Object.keys(subscriptionDevices), function(deviceKey, c) {
				Application.redisClient.get(deviceKey, function(err, deviceString) {
					if (err) return c(err);
					var deviceModified = false;
					var deviceObject = JSON.parse(deviceString);

					async.each(subscriptionDevices[deviceKey], function(subscriptionKey, c2) {
						if (deviceObject.subscriptions) {
							var idx = deviceObject.subscriptions.indexOf(subscriptionKey);

							if (idx !== -1) {
								deviceObject.subscriptions.splice(idx, 1);
								deviceModified = true;
							}
						}
						c2();
					});

					if (deviceModified)
						Application.redisClient.set([deviceKey, JSON.stringify(deviceObject)], function(){});

					c();
				})
			}, callback1);
		}
	], callback);
}

module.exports = Context;
