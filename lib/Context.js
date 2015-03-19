var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

function Context(_id, cb) {
	Application.bucket.get('blg:'+Context._model.namespace+':'+_id, (function(err, res) {
		if (!err) {
			var result = res.value;

			for(var prop in Context._model.properties) {
				if (Context._model.properties.hasOwnProperty(prop)) {
					this[prop] = result[prop];
				}
			}
		}

		cb(err, res);
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
	var query = cb.ViewQuery.from('dev_models', 'by_type').key(0);
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

Context.getOne = function(id, callback) {
	var key = 'blg:'+Context._model.namespace+':'+id;

	Application.bucket.get(key, callback);
}

module.exports = Context;
