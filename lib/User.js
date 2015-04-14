var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

function User(_id, callback) {
	Application.bucket.get('blg:'+User._model.namespace+':'+_id, (function(err, res) {
		if (!err) {
			var result = res.value;

			for(var prop in User._model.properties) {
				if (User._model.properties.hasOwnProperty(prop)) {
					this[prop] = result[prop];
				}
			}
		}

		callback(err, result);
	}).bind(this));
}

User.load = function() {
	User._model = require('../models/admin.json');

	if (!User._model)
		throw new Error('Model spec file does not exist.');
};

User.count = function(callback) {
	var key = 'blg:'+User._model.namespace+':count';
	Application.bucket.get(key, function(err, result) {
		if (err) return callback(err, null);

		callback(null, result.value);
	});
}

User.create = function(props, callback) {
	async.waterfall([
		function(callback1) {
			User.count(callback1);
		},
		function(count, callback1) {
			var idx = count+1;
			var key = 'blg:'+User._model.namespace+':'+idx;
			var acceptedProps = {};

			acceptedProps.id = idx;
			acceptedProps.type = 'user';
			acceptedProps.authenticated = 0;

			for(var prop in User._model.properties) {
				if (User._model.properties.hasOwnProperty(prop)) {
					acceptedProps[prop] = props[prop];
				}
			}

			Application.bucket.insert(key, acceptedProps, function(err, result) {
				if (err) return callback1(err);

				callback1(null, acceptedProps);
			});
		}
	], callback);
}
