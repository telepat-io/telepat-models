var Application = require('./Application');
var cb = require('couchbase');
var async = require('async');

function Model(name, appId, _id, callback) {

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

		for(var prop in Object.keys(result)) {
			this[prop] = result[prop];
		}

		callback(err, result);
	}).bind(this));

}

Model.multiGet = function(modelName, ids, appId, context, callback) {
	var baseKey = 'blg:'+context+':'+Application.loadedAppModels[appId][modelName].namespace+':';

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

Model.getAll = function(modelName, appId, context, callback) {
	var query = cb.ViewQuery.from('dev_models', 'by_type_context').stale(1).custom({
		inclusive_end: "true",
		key: "["+context+',"'+Application.loadedAppModels[appId][modelName].type+'"]'
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

Model.lookup = function(modelName, appId, context, user_id, parent, callback) {
	var lookupKey = 'blg:'+context+':'+'users:'+user_id;

	if (parent)
		lookupKey += ':'+parent.model+':'+parent.id;

	lookupKey += ':'+Application.loadedAppModels[appId][modelName].namespace;

	Application.bucket.get(lookupKey, function(err, results) {
		if (!err) {
			results = JSON.parse('['+results.value.slice(0, -1)+']');
		}

		callback(err, results);
	});
}

Model.lookupWithKey = function(modelName, appId, context, key, user_id, parent, callback) {
	var lookupKey = 'blg:'+context+':'+'users:'+user_id;

	if (parent)
		lookupKey += ':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;

	lookupKey += ':'+Application.loadedAppModels[appId][modelName].namespace+':'+key;

	Application.bucket.get(lookupKey, function(err, results) {
		if (!err) {
			results = JSON.parse('['+results.value.slice(0, -1)+']');
		}

		callback(err, results);
	});
}

Model.delete = function(modelName, appId, id, onlyChild, callback) {
	var item = null;
    var key = null;

	async.waterfall([
		function(get_cb) {
			new Model(modelName, appId, id, function(err, result) {
				if (err) return get_cb(err);

				item = result;
                key = 'blg:'+item.context_id+':'+Application.loadedAppModels[appId][modelName].namespace+':'+id;
				get_cb();
			});
		},
		function(remove_cb) {
			Application.bucket.remove(key, remove_cb);
		},
		function(results, callback1) {
			if (onlyChild) return callback1();
			var children = Application.loadedAppModels[appId][modelName].has_many || [];
			children = children.concat(Application.loadedAppModels[appId][modelName].has_some) || [];

			if (children.length > 0) {
				async.each(children, function(child, c) {
					var query = cb.ViewQuery.from('dev_models', 'by_parent_model').custom({inclusive_end: true,
						key: '"'+Application.loadedAppModels[appId][modelName].namespace+id+Application.loadedAppModels[appId][child].namespace+'"'});

					Application.bucket.query(query, function(err, result) {
						if (err) console.log(err);
						async.each(result, function(item2, c2) {
							var keyValue = (new Buffer(item2.value, 'base64')).toString();
							var childrenItems = JSON.parse('['+keyValue.slice(0, -1)+']');

							async.each(childrenItems, function(item3, c3) {
								Model.delete(child, appId, item3, true, function(err, result) {if (err) console.log(err);});
								c3();
							}, function(err) {if (err) console.log(err);});

							Application.bucket.remove(item2.id, function(err) {if (err) console.log(err);});

							c2();
						}, function(err) {if (err) console.log(err);});
					});

					c();
				}, function(err) {if (err) console.log(err);});
				callback1();
			} else
				callback1();
		},
		function(callback1) {
			if (onlyChild) return callback1();

			async.parallel([
				function(callback2) {
					var childName = Application.loadedAppModels[appId][modelName].has_many;
					if (childName) {
						var countKey = 'blg:'+item.context_id+':';

						countKey += Application.loadedAppModels[appId][modelName].namespace+':'+id;
						countKey += ':'+Application.loadedAppModels[appId][childName].namespace+'_count';
						Application.bucket.remove(countKey, callback2);
					} else
						callback2();
				},
				function(callback2) {
					var childName = Application.loadedAppModels[appId][modelName].has_some;
					if (childName) {
						var countKey = 'blg:'+item.context_id+':';

						countKey += Application.loadedAppModels[appId][modelName].namespace+':'+id;
						countKey += ':'+Application.loadedAppModels[appId][childName].namespace+'_count';

						async.each(Object.keys(item.options), function(index, c) {
							Application.bucket.remove(countKey+':'+index, function(err, result) {if(err) console.log(err);});
							c();
						}, function(err, result) {if(err) console.log(err);});
					}

					callback2();
				},
			]);

			callback1();
		}
	], function(err, results){
		if (err)
			return callback(err, null);

		if (onlyChild)
			return callback();

		var lookupKey = null;
		var user_id = item.user_id;
        var context = item.context_id;
		var parent = null;

		for (var r in Application.loadedAppModels[appId][modelName].belongsTo) {
			if (item[Application.loadedAppModels[appId][modelName].belongsTo[r].parentModel+'_id'])
				parent = {model: Application.loadedAppModels[appId][modelName].belongsTo[r].parentModel,
					id: item[Application.loadedAppModels[appId][modelName].belongsTo[r].parentModel+'_id']};
		}

		if (user_id && parent)
			lookupKey = 'blg:'+context+':'+'users:'+user_id+':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;
		else if (user_id)
			lookupKey = 'blg:'+context+':'+'users:'+user_id;
		else if (parent)
			lookupKey = 'blg:'+context+':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;

		if (user_id || parent)
			lookupKey += ':'+Application.loadedAppModels[appId][modelName].namespace;

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

Model.deleteWithKey = function(modelName, appId, context, id, key, user_id, parent, callback) {
	var key1 = 'blg:'+context+':'+Application.loadedAppModels[appId][modelName].namespace+':'+id;

	Application.bucket.remove(key1, function(err, results) {
		var lookupKey = 'blg:'+context+':'+'users:'+user_id;

		if (parent)
			lookupKey += ':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;

		lookupKey += ':'+Application.loadedAppModels[appId][modelName].namespace+':'+key;

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
Model.countWithParent = function(modelName, appId, context, parent, callback) {
	var key = 'blg:'+context+':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id+':' +
		Application.loadedAppModels[appId][modelName].namespace+'_count';

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
Model.count = function(modelName, appId, callback) {
	var key = 'blg:'+Application.loadedAppModels[appId][modelName].namespace+':count';

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

Model.create = function(modelName, appId, props, callback1) {
	var lookupKey = null;
	var insertedItem = null;
	var user_id = props.user_id;
	var context = props.context_id;
	var parent = null;

	var relationType = null;
	var parentRelationKey = null;

	for (var r in Application.loadedAppModels[appId][modelName].belongsTo) {
		if (props[Application.loadedAppModels[appId][modelName].belongsTo[r].parentModel + '_id']) {
			parent = {
				model: Application.loadedAppModels[appId][modelName].belongsTo[r].parentModel,
				id: props[Application.loadedAppModels[appId][modelName].belongsTo[r].parentModel + '_id']
			};
			relationType = Application.loadedAppModels[appId][modelName].belongsTo[r].relationType;
		}
	}

	if (relationType == 'has_some') {
		parentRelationKey = props[parent.model+'_key'];
	}

	if (user_id && parent)
		lookupKey = 'blg:'+context+':'+'users:'+user_id+':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;
	else if (user_id)
		lookupKey = 'blg:'+context+':'+'users:'+user_id;
	else if (parent)
		lookupKey = 'blg:'+context+':'+Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;

	if (user_id || parent)
		lookupKey += ':'+Application.loadedAppModels[appId][modelName].namespace;
	if (parentRelationKey !== null)
		lookupKey += ':'+parentRelationKey;

	async.waterfall([
		function(callback) {
			Model.count(modelName, appId, callback);
		},
		function(count, callback) {
			var idx = count+1;
			var directKey = 'blg:'+context+':'+Application.loadedAppModels[appId][modelName].namespace+':'+idx;

			props.application_id = appId;
			props.id = idx;
			props.created = Math.floor((new Date()).getTime()/1000);
			props.modified = props.created;
			props.type = modelName;

			Application.bucket.insert(directKey, props, function(err, results) {
				if (!err) {
					insertedItem = {};
					insertedItem[idx] = props;
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
			Model.increment(modelName, appId, 1, callback);
		},
		function(result, callback) {
			if (parent)
				Model.incrementWithParent(modelName, appId, context, 1, parent, parentRelationKey, callback);
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
Model.increment = function(modelName, appId, delta, callback) {
	var countKey = 'blg:'+Application.loadedAppModels[appId][modelName].namespace+':count';

	Application.bucket.counter(countKey, delta, {initial: 1}, callback);
};

Model.incrementWithParent = function(modelName, appId, context, delta, parent, key, callback) {
	var countKey = 'blg:'+context+':';

	countKey += Application.loadedAppModels[appId][parent.model].namespace+':'+parent.id;
	countKey += ':'+Application.loadedAppModels[appId][modelName].namespace+'_count';

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
Model.update = function(modelName, appId, id, patch, callback) {
	//var lookupKey = null;

	async.waterfall([
		function(get_cb) {
            new Model(modelName, appId, id, function(err, result) {
                if (err) return get_cb(err);
                get_cb(null, result);
            });
		},
		function(item, get_cb) {
			var user_id = item.user_id;
            var context = item.context_id;
			var parent = null;

            var directKey = 'blg:'+context+':'+Application.loadedAppModels[appId][modelName].namespace+':'+id;

			/*if (user_id && parent)
				lookupKey = 'blg:'+context+':'+'users:'+user_id+':'+parent.model+':'+parent.id;
			else if (user_id)
				lookupKey = 'blg:'+context+':'+'users:'+user_id;
			else if (parent)
				lookupKey = 'blg:'+context+':'+parent.model+':'+parent.id;

			if (user_id || parent)
				lookupKey += ':'+Model._spec[modelName].namespace;*/

			for (var i in patch) {
				if (patch.hasOwnProperty(i) && ['id', 'type', 'created', 'modified', 'application_id', 'context_id'].indexOf(patch[i].path) == -1) {
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
