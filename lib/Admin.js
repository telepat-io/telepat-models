var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

function Admin(_id, callback) {
	Application.bucket.get('blg:'+Admin._model.namespace+':'+_id, (function(err, res) {
		if (!err) {
			var result = res.value;

			for(var prop in Admin._model.properties) {
				if (Admin._model.properties.hasOwnProperty(prop)) {
					this[prop] = result[prop];
				}
			}
		}

		callback(err, result);
	}).bind(this));
}

Admin.load = function() {
	Admin._model = require('../models/admin.json');

	if (!Admin._model)
		throw new Error('Model spec file does not exist.');
};

Admin.prototype.get = function(key) {
	if (this.hasOwnProperty(key))
		return this[key];

	return undefined;
};



Admin.create = function(_id, props, callback) {
	var acceptedProps = {};

	for(var prop in Admin._model.properties) {
		if (Admin._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	console.log(acceptedProps);

	var newKey = 'blg:'+Admin._model.namespace+':'+_id;

	Application.bucket.insert(newKey, acceptedProps, function(err1, result1) {
		if (err1) 
			return callback(err1, result1);

		return callback(null, result1);
	});
}



Admin.update = function(_id, props, callback) {
	var key = 'blg:'+Admin._model.namespace+':'+_id;

	Application.bucket.get(key, (function(err, res) {
		if (err)
			return callback(err, res);

		var acceptedProps = res.value;

		for(var prop in Admin._model.properties) {
			if (prop != 'email' && Admin._model.properties.hasOwnProperty(prop)) {
				acceptedProps[prop] = props[prop];
			}
		}

		Application.bucket.replace(key, acceptedProps, callback);
	}));
}

module.exports = Admin;
