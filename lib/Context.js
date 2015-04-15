var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

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

		callback(err, res);
	}).bind(this));
}

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

Context.getAll = function(by_app, callback) {
	if (by_app) {
		async.waterfall([
			function(callback1) {
				var key = 'blg:'+Application._model.namespace+':'+by_app+':contexts';
				console.log(key);
				Application.bucket.get(key, callback1);
			},
			function(results, callback1) {
				var appContexts = JSON.parse('['+results.value.slice(0, -1)+']');

				var baseKey = 'blg:'+Context._model.namespace+':';

				async.map(appContexts, function(item, c){
					c(null, baseKey+item);
				}, function(cb1, results) {
					Application.bucket.getMulti(results, function(err, results1) {
						var allModels = {};
						if(!err) {
							for(var m in results1) {
								var modelId = m.split(':').slice(-1)[0];
								allModels[modelId] = results1[m].value;
							}
						}

						callback1(err, allModels);
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
		var allContexts = {};
		Application.bucket.query(query, function(err, results) {
			async.each(results, function(item, c){
				var contextId = item.id.split(':').slice(-1)[0];
				allContexts[contextId] = item.value;
				c();
			}, function(err1) {
				callback(err, allContexts);
			});
		});
	}
}

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
				Application.bucket.insert(lookupKey, '1,', callback1);
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

			var res = {};
			res[idx] = acceptedProps;

			callback(null, res);
		});
	});
}

Context.increment = function(delta, callback) {
	var key = 'blg:'+Context._model.namespace+':count';

	Application.bucket.counter(key, delta, {initial: 1}, callback);
};

Context.update = function(id, props, callback) {
	var key = 'blg:'+Context._model.namespace+':'+id;
	var acceptedProps = {};

	for(var prop in Context._model.properties) {
		if (Context._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	Application.bucket.replace(key, acceptedProps, callback);
}

module.exports = Context;
