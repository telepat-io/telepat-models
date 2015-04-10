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
	Context._model = require('../models/Context.json');

	if (!Context._model)
		throw new Error('Model spec file does not exist.');
};

Context.prototype.get = function(key) {
	if (this.hasOwnProperty(key))
		return this[key];

	return undefined;
};

Context.getAll = function(callback) {
	var query = cb.ViewQuery.from('dev_models', 'by_type').key('context').custom({ inclusive_end: true, stale: false });;
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

Context.count = function(callback) {
	var key = 'blg:'+Context._model.namespace+':count';

	Application.bucket.get(key, function(err, result) {
		if (err.code == 13) {
			Application.bucket.insert(key, 0, function(err1, result1) {
				callback(err1, 0);
			});
		} else
			callback(err, result)
	});
}

Context.create = function(props, callback) {
	var acceptedProps = {};

	for(var prop in Application._model.properties) {
		if (Application._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	Context.count(function(err, result) {
		if (err) return callback(err, result);

		var idx = result+1;
		var newKey = 'blg:'+Context._model.namespace+':'+idx;

		Context.bucket.insert(newKey, acceptedProps, function(err1, result1) {
			if (err1) return callback(err1, result1);

			Context.increment(1, function(err2, result2) {
				if (err2) return callback(err2, result2);

				callback(null, result1);
			});
		});
	});
}

Context.increment = function(delta, callback) {
	var key = 'blg:'+Context._model.namespace+':count';

	Context.bucket.counter(key, delta, {initial: 1}, callback);
};

Context.update = function(id, props, callback) {
	var key = 'blg:'+Context._model.namespace+':'+id;
	var acceptedProps = {};

	for(var prop in Context._model.properties) {
		if (Context._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	Context.bucket.replace(key, acceptedProps, callback);
}

module.exports = Context;
