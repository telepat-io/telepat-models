var cb = require('couchbase');
/**
 *
 * @param _id
 * @param callback
 * @constructor
 * @property bucket Bucket
 * @property stateBucket Bucket
 */
function Application(_id, callback) {
	Application.bucket.get('blg:'+Application._model.namespace+':'+_id, (function(err, res) {
        if (!err) {
			var result = res.value;

			for(var prop in Application._model.properties) {
				if (Application._model.properties.hasOwnProperty(prop)) {
					this[prop] = result[prop];
				}
			}
		}

		callback(err, res);
    }).bind(this));
}

Application.loadedAppModels = {};

Application.load = function() {
	Application._model = require('../models/application.json');

	if (!Application._model)
		throw new Error('Model spec file does not exist.');
};

Application.loadAppModels = function(appId, callback) {
	var key = 'blg:'+Application._model.namespace+':'+appId+':schemas';
	Application.bucket.get(key, function(err, result) {
		if (err && err.code == cb.errors.keyNotFound) {
			var error = new Error('Application does not exist.');
			error.status = 404;

			return callback(error);
		}
		else if (err) return callback(err);

		Application.loadedAppModels[appId] = result.value;
		callback();
	});
}

Application.setBucket = function(bucket) {
	Application.bucket = bucket;
}

Application.setStateBucket = function(bucket) {
	Application.stateBucket = bucket;
}

Application.getAll = function(callback) {
	var query = cb.ViewQuery.from('dev_models', 'by_type').key('application').custom({ inclusive_end: true, stale: false });
	Application.bucket.query(query, callback);
}

Application.count = function(callback) {
	var key = 'blg:'+Application._model.namespace+':count';

	Application.bucket.get(key, function(err, result) {
		if (err && err.code == 13) {
			Application.bucket.insert(key, 0, function(err1, result1) {
				callback(err1, 0);
			});
		} else {
			callback(err, result);
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
	acceptedProps['type'] = 'application';

	Application.count(function(err, result) {
		if (err) return callback(err, result, null);

		var idx = result.value+1;
		var newKey = 'blg:'+Application._model.namespace+':'+idx;

		Application.bucket.insert(newKey, acceptedProps, function(err1, result1) {
			if (err1) return callback(err1, result1, idx);

			Application.increment(1, function(err2, result2) {
				if (err2) return callback(err2, result2, idx);
				var res = {};
				res[idx] = acceptedProps;
				callback(null, res);
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
	Application.bucket.get(key, (function(err, res) {
		if (err)
			return callback(err, res);

		var acceptedProps = res.value;

		for(var prop in Application._model.properties) {
			if (Application._model.properties.hasOwnProperty(prop)) {
				acceptedProps[prop] = props[prop];
			}
		}

		Application.bucket.replace(key, acceptedProps, function(err, res1) {
			if (err)
				callback(err, res1);
			else
				callback(null, res1, acceptedProps);
		});
	}));
}

Application.delete = function (id, callback) {
	var key = 'blg:'+Application._model.namespace+':'+id;
	Application.bucket.remove(key, callback);
}

Application.getAppSchema = function(appId, callback) {
	var key = 'blg:'+Application._model.namespace+':'+appId+':schemas';

	Application.bucket.get(key, function(err, result) {
		if (err && err.code == 13) {
			callback(null, {});
		} else {
			callback(err, result);
		}
	});
}

Application.updateSchema = function(appId, schema, callback) {
	// TODO: Schema validation
	var key = 'blg:'+Application._model.namespace+':'+appId+':schemas';
	console.log(key);
	Application.bucket.upsert(key, schema, {}, callback);
}

Application.deleteModel = function(appId, modelName, callback) {
	var key = 'blg:'+Application._model.namespace+':'+appId+':schemas';
	var removedModel = null;

	async.waterfall([
		function(callback1) {
			Application.getAppSchema(appId, callback1);
		},
		function(result, callback1) {
			var schema = result.value;
			if (schema[modelName]) {
				removedModel = schema[modelName];
				delete schema[modelName];
				Application.updateSchema(appId, schema, function(err, result1) {callback1(err);});
			}
			else
				callback1();
		},
		function(callback1) {
			var query = cb.ViewQuery.from('dev_models', 'by_type').custom({key: '"'+modelName+'"', inclusive_end: true});
			Application.bucket.query(query, callback1);
		},
		function(results, callback1) {
			async.each(results, function(item, c) {
				Application.bucket.remove(item.id, function(err, callback) {});
				c();
			}, callback1);
		},
		function(callback1) {
			var query = cb.ViewQuery.from('dev_models', 'by_model_lookup').custom({key: '"'+modelName+'"', inclusive_end: true});
			Application.bucket.query(query, callback1);
		},
		function(results, callback1) {
			async.each(results, function(item, c) {
				Application.bucket.remove(item.id, function(err, callback) {});
				c();
			}, callback1);
		},
	], callback);
}

Application.prototype.get = function(key) {
    if (this.hasOwnProperty(key))
        return this[key];

    return undefined;
};


module.exports = Application;
