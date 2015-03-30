var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

function Model(name, _id, context, callback) {

	this.id = _id;

	Application.bucket.get('blg:'+context+':'+Model._spec[name].namespace+':'+_id, (function(err, res) {
		var result = res.value;

		for(var prop in Model._spec[name].properties) {
			if (Model._spec[name].properties.hasOwnProperty(prop)) {
				this[prop] = result[prop];
			}
		}

		this.author = result.author;
		if (result.parent) this.parent = result.parent;

		callback(err, res);
	}).bind(this));

}

Model.load = function(app) {
	Model._spec = app.ModelsConfig;
	for (var m in Model._spec) {
		Model._spec[m].properties.context_id = {type: "integer"};
	}
};

Model.multiGet = function(modelName, ids, context, callback) {
	var baseKey = 'blg:'+context+':'+Model._spec[modelName].namespace+':';

	async.map(ids, function(item, c){
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

			callback(err, allModels);
		});
	});

}

Model.getAll = function(modelName, context, callback) {
	var query = cb.ViewQuery.from('dev_models', 'by_type_context').stale(1).custom({
		inclusive_end: "true",
		key: "["+context+',"'+Model._spec[modelName].type+'"]'
	});
	Application.bucket.query(query, function(err, results) {
		var allModels = {};

		if (err) return callback(err, null);

		async.each(results, function(item, c){
			var modelId = item.id.split(':').slice(-1)[0];
			allModels[modelId] = item.value;
			c();
		}, function(err1) {
			callback(err, allModels);
		});
	});
}

Model.lookup = function(modelName, context, user_id, parent, callback) {
	var lookupKey = 'blg:'+context+':'+'users:'+user_id;

	if (parent)
		lookupKey += ':'+parent.model+':'+parent.id;

	lookupKey += ':'+Model._spec[modelName].namespace;

	Application.bucket.get(lookupKey, function(err, results) {
		if (!err) {
			results = JSON.parse('['+results.value.slice(0, -1)+']');
		}

		callback(err, results);
	});
}

Model.lookupWithKey = function(modelName, context, key, user_id, parent, callback) {
	var lookupKey = 'blg:'+context+':'+'users:'+user_id;

	if (parent)
		lookupKey += ':'+parent.model+':'+parent.id;

	lookupKey += ':'+Model._spec[modelName].namespace+':'+key;

	console.log(lookupKey);

	Application.bucket.get(lookupKey, function(err, results) {
		if (!err) {
			results = JSON.parse('['+results.value.slice(0, -1)+']');
		}

		callback(err, results);
	});
}

Model.delete = function(modelName, context, id, user_id, parent, callback) {
	var key = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+id;

	Application.bucket.remove(key, function(err, results) {
		var lookupKey = 'blg:'+context+':'+'users:'+user_id;

		if (parent)
			lookupKey += ':'+parent.model+':'+parent.id;

		lookupKey += ':'+Model._spec[modelName].namespace;

		Application.bucket.getAndLock(lookupKey, function(err1, results1) {
			results1 = JSON.parse('['+results1.value.substr(0, results1.value.length-1)+']');
			var idx = results1.indexOf(id);

			if (idx !== -1)
				Application.bucket.replace(lookupKey, results.splice(idx+1, 1).toString()+',', results1.cas, callback);
			else
				Application.bucket.unlock(lookupKey, results1.cas, callback);
		});
	});
};

Model.deleteWithKey = function(modelName, context, id, key, user_id, parent, callback) {
	var key1 = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+id;

	Application.bucket.remove(key1, function(err, results) {
		var lookupKey = 'blg:'+context+':'+'users:'+user_id;

		if (parent)
			lookupKey += ':'+parent.model+':'+parent.id;

		lookupKey += ':'+Model._spec[modelName].namespace+':'+key;

		Application.bucket.getAndLock(lookupKey, function(err1, results1) {
			results1 = JSON.parse('['+results1.value.substr(0, results1.value.length-1)+']');
			var idx = results1.indexOf(id);

			if (idx === -1)
				Application.bucket.replace(lookupKey, results.splice(idx+1, 1).toString()+',', results1.cas, callback);
			else
				Application.bucket.unlock(lookupKey, results1.cas, callback);
		});
	});
};

/**
 * Counts objects bound to a parent and context
 * @param modelName
 * @param context
 * @param parent
 * @param callback
 */
Model.countWithParent = function(modelName, context, parent, callback) {
	var key = 'blg:'+context+':'+parent.model+':'+parent.id+':'+Model._spec[modelName].namespace+'_count';

	Application.bucket.get(key, function(err, result) {
		if (err) {
			Application.bucket.insert(key, 0,function(err, result) {
				callback(err, result);
			});
		} else {
			callback(err, result);
		}
	});
}

/**
 * Used for unique IDs
 * @param modelName
 * @param callback
 */
Model.count = function(modelName, callback) {
	var key = 'blg:'+Model._spec[modelName].namespace+':count';

	Application.bucket.get(key, callback);
}

Model.create = function(modelName, context, props, user_id, parent, callback1) {
	var directKey = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+idx;
	var lookupKey = 'blg:'+context+':'+'users:'+user_id;

	if (parent)
		lookupKey += ':'+parent.model+':'+parent.id;

	lookupKey += ':'+Model._spec[modelName].namespace;

	async.waterfall([
		function(callback) {
			Model.count(modelName, callback);
		},
		function(count, callback) {
			var idx = parseInt(count.value)+1;
			var acceptedProps = {};

			for(var prop in Model._spec[modelName].properties) {
				if (Model._spec[modelName].properties.hasOwnProperty(prop)) {
					acceptedProps[prop] = props[prop];
				}
			}

			acceptedProps.author = user_id;
			if (parent) acceptedProps.parent = parent.id;

			var insertResults = null;

			Application.bucket.insert(directKey, acceptedProps, function(err, results) {
				callback(err, {idx: idx, results: results});
			});
		},
		function(result, callback) {
			Application.bucket.append(lookupKey, result.idx+',', function(err, results) {
				callback(err, {content: result.idx+','});
			});
		}
	], function(err, result) {
		if (err.code == cb.errors.notStored) {
			Application.bucket.insert(lookupKey, result.content, callback1);
		} else if (err)
			callback1(err, null);
		else
			callback1(null, result);
	});
};

/**
 * Used for incrementing the index
 * @param modelName
 * @param context
 * @param delta
 * @param callback
 */
Model.increment = function(modelName, context, delta, callback) {
	var countKey = 'blg:'+Model._spec[modelName].namespace+':count';

	Application.bucket.counter(countKey, delta, {initial: 0}, callback);
};

Model.incrementWithParent = function(modelName, context, delta, parent, callback) {
	var countKey = 'blg:'+context+':';

	countKey += parent.model+':'+parent.id;
	countKey += ':'+Model._spec[modelName].namespace+'_count';

	Application.bucket.counter(countKey, delta, {initial: 0}, callback);
};

/**
 *
 * @param props changed properties of the model
 * @param user_id author of the model
 * @param parent parent of the model ({name, id} object)
 * @param cb
 */
Model.update = function(modelName, context, props, user_id, parent, callback) {
	var id = props._id;

	var directKey = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+id;
	var lookupKey = 'blg:'+context+':users:'+user_id;

	if (parent)
		lookupKey += ':'+parent.model+':'+parent.id;

	lookupKey += ':'+Model._spec[modelName].namespace;

	var acceptedProps = {};

	for(var prop in Model._spec[modelName].properties) {
		if (Model._spec[modelName].properties.hasOwnProperty(prop)) {
			acceptedProps[prop] = props[prop];
		}
	}

	//author changed, must update related keys as well
	if (props.author) {
		acceptedProps.author = user_id;
		Application.bucket.getAndLock(lookupKey, function(err, results){
			if (err) {
				callback(err, null);
				return;
			}

			var destinationLookupKey = 'blg:users:'+user_id;

			//we want to change the parent only if it already has
			if (props._parent && parent) {
				destinationLookupKey += ':'+props._parent.model+':'+props._parent.id;
				acceptedProps.parent = props._parent.id;
			} else if (parent)
				destinationLookupKey += ':'+parent.model+':'+parent.id;

			destinationLookupKey += ':'+Model._spec[modelName].namespace;

			results = JSON.parse('['+results.value.substr(0, results.value.length-1)+']');
			var idx = results.indexOf(id);

			Application.bucket.replace(lookupKey, results.splice(idx+1, 1).toString()+',', results.cas, function(err, results) {});
			Application.bucket.append(destinationLookupKey, id+',');
		});
	}

	Application.bucket.replace(directKey, acceptedProps, callback);
};

module.exports = Model;
