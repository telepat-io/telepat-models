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
	var key = 'blg:'+Application._model.namespace+':count';

	Application.bucket.get(key, function(err, result) {
		if (err.code == 13) {
			Application.bucket.insert(key, 0, function(err1, result1) {
				cb(err1, 0);
			});
		} else {
			cb(err, result);
		}
	});
};

Application.create = function(props, callback) {
	var acceptedProps = {};

	for(var prop in Application._model.properties) {
		if (Application._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	Application.count(function(err, result) {
		if (err) return callback(err, result);

		var idx = result+1;
		var newKey = 'blg:'+Application._model.namespace+':'+idx;

		Application.bucket.insert(newKey, acceptedProps, function(err1, result1) {
			if (err1) return callback(err1, result1);

			Application.increment(1, function(err2, result2) {
				if (err2) return callback(err2, result2);

				callback(null, result1);
			});
		});
	});
};

Application.increment = function(delta, callback) {
	var key = 'blg:'+Application._model.namespace+':count';

	Application.bucket.counter(key, delta, {initial: 1}, callback);
};

Application.update = function(id, props, callback) {
	var key = 'blg:'+Application._model.namespace+':'+id;
	var acceptedProps = {};

	for(var prop in Application._model.properties) {
		if (Application._model.properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	Application.bucket.replace(key, acceptedProps, callback);
}

Application.prototype.get = function(key) {
    if (this.hasOwnProperty(key))
        return this[key];

    return undefined;
};


module.exports = Application;
