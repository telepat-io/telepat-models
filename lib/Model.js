var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

function Model(name, _id, callback) {

	this.id = _id;

	var query = cb.ViewQuery.from('dev_models', 'by_type_id').stale(1).custom(
		{
			inclusive_end: true,
			key: '["'+name+'",'+_id+']'
		});
	Application.bucket.query(query, (function(err, res) {
		if (err) return callback(err, null);

        if (!res[0]) {
            err = new Error('Item does not exist.');
            err.code = cb.errors.keyNotFound;

            return callback(err);
        }

        var result = res[0].value;

		for(var prop in Model._spec[name].properties) {
			if (Model._spec[name].properties.hasOwnProperty(prop)) {
				this[prop] = result[prop];
			}
		}

		callback(err, result);
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

Model.delete = function(modelName, id, callback) {
	var item = null;
    var key = null;
	//user_id
	//parent

	async.waterfall([
		function(get_cb) {
			new Model(modelName, id, function(err, result) {
				if (err) return get_cb(err, null);

				item = result;
                key = 'blg:'+item.context_id+':'+Model._spec[modelName].namespace+':'+id;
				get_cb(null, null);
			});
		},
		function(arg, remove_cb) {
			Application.bucket.remove(key, remove_cb);
		}
	], function(err, results){
		if (err)
			return callback(err, null);

		var lookupKey = null;
		var user_id = item.user_id;
        var context = item.context_id;
		var parent = null;

		for (var r in Model._spec[modelName].belongsTo) {
			if (item[Model._spec[modelName].belongsTo[r].parentModel+'_id'])
				parent = {model: Model._spec[modelName].belongsTo[r].parentModel, id: item[Model._spec[modelName].belongsTo[r].parentModel+'_id']};
		}

		if (user_id && parent)
			lookupKey = 'blg:'+context+':'+'users:'+user_id+':'+Model._spec[parent.model].namespace+':'+parent.id;
		else if (user_id)
			lookupKey = 'blg:'+context+':'+'users:'+user_id;
		else if (parent)
			lookupKey = 'blg:'+context+':'+Model._spec[parent.model].namespace+':'+parent.id;

		if (user_id || parent)
			lookupKey += ':'+Model._spec[modelName].namespace;

		if (lookupKey) {
			Application.bucket.getAndLock(lookupKey, function(err1, results1) {
				if (err1) return callback(err1, null);

				var results2 = JSON.parse('['+results1.value.substr(0, results1.value.length-1)+']');
				var idx = results2.indexOf(id);

				if (idx !== -1) {
					results2.splice(idx, 1);
					Application.bucket.replace(lookupKey, results2.toString()+',', {cas: results1.cas}, callback);
				}
				else
					Application.bucket.unlock(lookupKey, results1.cas, callback);
			});
		} else
			callback(null, results);
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

			if (idx === -1) {
				results.splice(idx, 1);
				Application.bucket.replace(lookupKey, results.toString()+',', {cas: results1.cas}, callback);
			} else
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
	var key = 'blg:'+context+':'+Model._spec[parent.model].namespace+':'+parent.id+':'+Model._spec[modelName].namespace+'_count';

	Application.bucket.get(key, function(err, result) {
		if (err && err.code == cb.errors.keyNotFound) {
			Application.bucket.insert(key, 0, function(err, result) {
				callback(err, 0);
			});
		} else if (err) {
			callback(err);
		} else
			callback(null, result.value);
	});
}

/**
 * Used for unique IDs
 * @param modelName
 * @param callback
 */
Model.count = function(modelName, callback) {
	var key = 'blg:'+Model._spec[modelName].namespace+':count';

	async.waterfall([
		function(callback1) {
			Application.bucket.get(key, function(err, result) {
				if (err && err.code == cb.errors.keyNotFound)
					callback1(null, 0);
				else if (err)
					callback1(err);
				else
					callback1(null, result.value);
			});
		},
		function(count, callback1) {
			if (count == 0) {
				Application.bucket.insert(key, 0, function (err, result) {
					if (err) return callback1(err);

					callback1(null, 0);
				});
			} else {
				callback1(null, count);
			}
		}
	], callback);
}

Model.create = function(modelName, props, callback1) {
	var lookupKey = null;
	var insertedItem = null;
	var user_id = props.user_id;
	var context = props.context_id;
	var parent = null;

	var relationType = null;
	var parentRelationKey = null;

	for (var r in Model._spec[modelName].belongsTo) {
		if (props[Model._spec[modelName].belongsTo[r].parentModel + '_id']) {
			parent = {
				model: Model._spec[modelName].belongsTo[r].parentModel,
				id: props[Model._spec[modelName].belongsTo[r].parentModel + '_id']
			};
			relationType = Model._spec[modelName].belongsTo[r].relationType;
		}
	}

	if (relationType == 'has_some') {
		parentRelationKey = props[parent.model+'_key'];
	}

	if (user_id && parent)
		lookupKey = 'blg:'+context+':'+'users:'+user_id+':'+Model._spec[parent.model].namespace+':'+parent.id;
	else if (user_id)
		lookupKey = 'blg:'+context+':'+'users:'+user_id;
	else if (parent)
		lookupKey = 'blg:'+context+':'+Model._spec[parent.model].namespace+':'+parent.id;

	if (user_id || parent)
		lookupKey += ':'+Model._spec[modelName].namespace;
	if (parentRelationKey !== null)
		lookupKey += ':'+parentRelationKey;

	async.waterfall([
		function(callback) {
			Model.count(modelName, callback);
		},
		function(count, callback) {
			var idx = count+1;
			var directKey = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+idx;
			var acceptedProps = {};

			props.id = idx;
			props.created = Math.floor((new Date()).getTime()/1000);
			props.modified = props.created;
			props.type = modelName;

			for(var prop in Model._spec[modelName].properties) {
				if (Model._spec[modelName].properties.hasOwnProperty(prop)) {
					acceptedProps[prop] = props[prop];
				}
			}

			Application.bucket.insert(directKey, acceptedProps, function(err, results) {
				if (!err) {
					insertedItem = {};
					insertedItem[idx] = acceptedProps;
				}

				callback(err, {idx: idx, results: results});
			});
		},
		function(result, callback) {
			if (lookupKey) {
				async.waterfall([
					function(lookup_cb) {
						Application.bucket.get(lookupKey, function(err, results) {
							if (err && err.code == cb.errors.keyNotFound)
								return lookup_cb(null, false);

							var ids = JSON.parse('['+results.value.slice(0, -1)+']');

							if (ids.indexOf(result.idx) === -1)
								lookup_cb(err, results);
							else
								lookup_cb(true, results);
						});
					},
					function(result1, lookup_cb) {
						if (result1 === false) {
							Application.bucket.insert(lookupKey, result.idx+',', lookup_cb);
						} else {
							Application.bucket.append(lookupKey, result.idx+',', lookup_cb);
						}
					}
				], function(lookup_err, lookup_result){
					if (lookup_err === true || lookup_err === null)
						callback(null, lookup_result);
					else
						callback(lookup_err, lookup_result);
				});
			} else
				callback(null, result);
		},
		function(result, callback) {
			Model.increment(modelName, 1, callback);
		},
		function(result, callback) {
			if (parent)
				Model.incrementWithParent(modelName, context, 1, parent, parentRelationKey, callback);
			else
				callback(null, result);
		}
	], function(err, result) {
		if (err && err.code == cb.errors.notStored) {
			Application.bucket.insert(lookupKey, result.content, function(err1, result1) {
				if(err1) return callback1(err1, null);

				callback1(null, insertedItem);
			});
		} else if (err)
			callback1(err, null);
		else
			callback1(null, insertedItem);
	});
};

/**
 * Used for incrementing the index
 * @param modelName
 * @param context
 * @param delta
 * @param callback
 */
Model.increment = function(modelName, delta, callback) {
	var countKey = 'blg:'+Model._spec[modelName].namespace+':count';

	Application.bucket.counter(countKey, delta, {initial: 1}, callback);
};

Model.incrementWithParent = function(modelName, context, delta, parent, key, callback) {
	var countKey = 'blg:'+context+':';

	countKey += Model._spec[parent.model].namespace+':'+parent.id;
	countKey += ':'+Model._spec[modelName].namespace+'_count';

	if (key !== null && key !== undefined) {
		countKey += ':'+key;
	}

	Application.bucket.counter(countKey, delta, {initial: 1}, callback);
};

/**
 *
 * @param props changed properties of the model
 * @param user_id author of the model
 * @param parent parent of the model ({name, id} object)
 * @param cb
 */
Model.update = function(modelName, id, patch, callback) {
	//var lookupKey = null;

	async.waterfall([
		function(get_cb) {
            new Model(modelName, id, function(err, result) {
                if (err) return get_cb(err);
                get_cb(null, result);
            });
		},
		function(item, get_cb) {
			var user_id = item.user_id;
            var context = item.context_id;
			var parent = null;

            var directKey = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+id;

			/*if (user_id && parent)
				lookupKey = 'blg:'+context+':'+'users:'+user_id+':'+parent.model+':'+parent.id;
			else if (user_id)
				lookupKey = 'blg:'+context+':'+'users:'+user_id;
			else if (parent)
				lookupKey = 'blg:'+context+':'+parent.model+':'+parent.id;

			if (user_id || parent)
				lookupKey += ':'+Model._spec[modelName].namespace;*/

			for (var i in patch) {
				if (patch.hasOwnProperty(i) && Model._spec[modelName].properties[patch[i].path]) {
					switch (patch[i].op) {
						case 'replace': {
							item[patch[i].path] = patch[i].value;

							break;
						}

						case 'increment': {
							item[patch[i].path] += patch[i].value;

							break;
						}
					}
				}
			}

			item.modified = Math.floor((new Date()).getTime()/1000);

			Application.bucket.replace(directKey, item, get_cb);
		}
	], callback);
};

module.exports = Model;
