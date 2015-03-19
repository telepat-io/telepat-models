var cb = require('couchbase');

function Application(_id, cb) {
	Application.bucket.get('blg:'+Application._model.namespace+':'+_id, (function(err, res) {
        if (!err) {
			var result = res.value;

			for(var prop in Application._model.properties) {
				if (Application._model.properties.hasOwnProperty(prop)) {
					this[prop] = result[prop];
				}
			}
		}

        cb(err, res);
    }).bind(this));
}

Application.load = function() {
	Application._model = require('../models/Application.json');

	if (!Application._model)
		throw new Error('Model spec file does not exist.');
};

Application.setBucket = function(bucket) {
	Application.bucket = bucket;
}

Application.getAll = function(callback) {
	var query = cb.ViewQuery.from('dev_models', 'by_type').key(1);
	Application.bucket.query(query, callback);
}

Application.count = function(cb) {
	var key = 'blg:application:count';

	Application.bucket.get(key, function(err, result) {
		if (err) {
			Application.bucket.insert(key, 0,function(err, result) {
				cb(err, result);
			});
		} else {
			cb(err, result);
		}
	});
}

Application.create = function(props, callback) {
	var acceptedProps = {};

	for(var prop in Application._model.properties) {
		if (Application._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	Application.count(function(err, result) {
		var idx = result.value+1;
		var newKey = 'blg:'+Application._model.namespace+':'+idx;

		Application.bucket.insert(newKey, acceptedProps, callback);
	});
}

Application.prototype.get = function(key) {
    if (this.hasOwnProperty(key))
        return this[key];

    return undefined;
};


module.exports = Application;
