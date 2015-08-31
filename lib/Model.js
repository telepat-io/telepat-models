var Application = require('./Application');
var async = require('async');
/**
 * Retrieves a single item of a certain type
 * @param name Name of the model/type
 * @param appId ID of the app of the model
 * @param _id ID of the item
 * @param callback
 * @constructor
 */
function Model(name, appId, context_id, _id, callback) {

	this.id = _id;

	if (!Application.loadedAppModels[appId]) {
		throw new Error('Invalid application id');
		return;
	}
	if (!Application.loadedAppModels[appId][name]) {
		throw new Error('Invalid model name');
		return;
	}

	var key = 'blg:'+context_id+':'+Application.loadedAppModels[appId][name].namespace+':'+_id;

	Application.bucket.get(key, (function(err, result) {
		if (err && err.code == cb.errors.keyNotFound) {
			err = new Error('Item does not exist.');
			err.code = cb.errors.keyNotFound;

			return callback(err);
		} else if (err) return callback(err, null);

		for(var prop in Object.keys(result)) {
			this[prop] = result.value[prop];
		}

		callback(err, result.value);
	}).bind(this));
}
/**
 * Get multiple items at once
 * @param modelName Name of the model/type
 * @param ids An array of ids of the items you want to get
 * @param appId ID of the app of the model
 * @param context The context of the item
 * @param callback
 */
Model.multiGet = function(modelName, ids, appId, context, callback) {
	var baseKey = 'blg:'+context+':'+Application.loadedAppModels[appId][modelName].namespace+':';

	async.map(ids, function(item, c){
		c(null, baseKey+item);
	}, function(cb1, results) {
		Application.bucket.getMulti(results, function(err, results1) {
			var allModels = [];

			if(results1) {
				for(var m in results1) {
					if (results1[m].value)
						allModels.push(results1[m].value);
				}
			}

			callback(null, allModels);
		});
	});

}
/**
 * Gets all items from a context
 * @param modelName Name of the model/type
 * @param appId ID of the app of the model
 * @param context The context of the item
 * @param callback function(error, result)
 */
Model.getAll = function(modelName, appId, context, callback) {
	var query = cb.ViewQuery.from('dev_models', 'by_type_context').stale(1).custom({
		inclusive_end: "true",
		key: "["+context+',"'+Application.loadedAppModels[appId][modelName].type+'"]'
	});
	Application.bucket.query(query, function(err, results) {
		var allModels = [];

		if (err) return callback(err, null);

		async.each(results, function(item, c){
			allModels.push(item.value);
			c();
		}, function(err1) {
			callback(err, allModels);
		});
	});
}

/**
 * Returns the content a lookup key. Lookup keys contain IDs that belong to a specific model that has a relation
 * @param modelName
 * @param appId
 * @param context
 * @param user_id
 * @param parent
 * @param callback
 */
Model.lookup = function(channel, callback) {
	Application.bucket.get(channel.get(), function(err, results) {
		if (err && err.code == cb.errors.keyNotFound) {
			return callback(null, [])
		} else if (err) {
			callback(err);
		} else {
			results = JSON.parse('[' + results.value.slice(0, -1) + ']');
			callback(err, results);
		}
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

Model.delete = function(modelName, context, appId, id, onlyChild, callback) {
	var item = null;
	var key = null;
	var children = Application.loadedAppModels[appId][modelName].hasMany || [];

	async.waterfall([
		function(get_cb) {
			new Model(modelName, appId, context, id, function(err, result) {
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

			if (Application.loadedAppModels[appId][modelName].hasSome)
				children = children.concat(Application.loadedAppModels[appId][modelName].hasSome) || [];

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
								Model.delete(child, context, appId, item3, true, function(err, result) {if (err) console.log(err);});
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
					if (children.length > 1) {
						async.each(children, function(childName, c) {
							var countKey = 'blg:'+item.context_id+':';

							countKey += Application.loadedAppModels[appId][modelName].namespace+':'+id;
							countKey += ':'+Application.loadedAppModels[appId][childName].namespace+'_count';

							if (item.options){
								async.each(Object.keys(item.options), function(index, c2) {
									Application.bucket.remove(countKey+':'+index, function(err, result) {if(err) console.log(err);});
									c2();
								}, function(err, result) {if(err) console.log(err);});
							}
							c();
						}, callback2);
					} else {
						callback2();
					}
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

	if (relationType == 'hasSome') {
		parentRelationKey = props[Application.loadedAppModels[appId][parent.model].hasSome_property+'_index'];
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
			if (parent) {
				Model(parent.model, appId, props.context_id, parent.id, function(err, result) {
					if (err && err.code == cb.errors.keyNotFound) {
						var error = new Error('Unable to create'.red+': parent "'+parent.model+'" with id '+parent.id+' does not exist');
						callback(error);
					} else if (err)
						callback(err);
					else if (result[Application.loadedAppModels[appId][parent.model].hasSome_property] && result[Application.loadedAppModels[appId][parent.model].hasSome_property].length <= parentRelationKey) {
						var error = new Error('Unable to create'.red+': parent relation key "'+parentRelationKey+'"' +
						' is not valid. Must be at most '+(result[Application.loadedAppModels[appId][parent.model].hasSome_property].length-1));
						callback(error);
					} else
						callback();
				});
			} else
				callback();
		},
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
				if (!err)
					insertedItem = props;

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
 * Updates and item
 * @param props changed properties of the model
 * @param user_id author of the model
 * @param parent parent of the model ({name, id} object)
 * @param cb
 */
Model.update = function(modelName, context, appId, id, patch, callback) {
	//var lookupKey = null;

	async.waterfall([
		function(get_cb) {
			new Model(modelName, appId, context, id, function(err, result) {
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
