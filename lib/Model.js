var Context = require('../lib/Context').Context;
var async = require('async');

function Model(name, _id, context, app, callback) {

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

		cb(err, res);
	}).bind(this));

}

Model.load = function(app) {
	Model._spec = app.ModelsConfig;
};

Model.get = function(modelName, id, context, cb) {
	var key = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+id;

	Application.bucket.get(key, cb);
};

Model.multiGet = function(modelName, ids, context, cb) {
	var baseKey = 'blg:'+context+':'+Model._spec[modelName].namespace+':';

	async.map(ids, function(item, c){
		c(null, baseKey+item);
	}, function(callback, results) {
		Application.bucket.getMulti(results, cb);
	});

}

Model.getAll = function(modelName, context, cb) {
	var query = cb.ViewQuery.from('dev_models', 'by_type').key(1);
	Application.bucket.query(query, callback);
}

Model.lookup = function(modelName, context, user_id, parent, cb) {
	var lookupKey = 'blg:'+context+':'+'user:'+user_id;

	if (parent)
		lookupKey += ':'+parent.model+':'+parent.id;

	lookupKey += ':'+Model._spec[modelName].namespace;
}

Model.delete = function(modelName, context, id, user_id, parent, cb) {
	var key = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+id;

	Application.bucket.remove(key, function(err, results) {
		var lookupKey = 'blg:'+context+':'+'user:'+user_id;

		if (parent)
			lookupKey += ':'+parent.model+':'+parent.id;

		lookupKey += ':'+Model._spec[modelName].namespace;

		Application.bucket.getAndLock(lookupKey, function(err1, results1) {
			results1 = JSON.parse('['+results1.value.substr(0, results1.value.length-1)+']');
			var idx = results1.indexOf(id);

			Application.bucket.replace(lookupKey, results.splice(idx, 1).toString()+',', cb);
		});
	});
};

Model.countWithParent = function(modelName, context, parent, cb) {
	var key = 'blg:'+context+':'+parent.model+':'+parent.id+':'+Model._spec[modelName].namespace+'_count';

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

Model.count = function(modelName, context, cb) {
	var key = 'blg:'+context+':'+Model._spec[modelName].namespace+':count';
}

Model.create = function(modelName, context, props, user_id, parent, cb) {
	Model.count(parent, function(err, results) {
		if (err) {
			cb(err, null); return;
		}

		var idx = results.value.count++;
		var directKey = 'blg:'+context+':'+Model._spec[modelName].namespace+':'+idx;
		var lookupKey = 'blg:'+context+':'+'user:'+user_id;

		if (parent)
			lookupKey += ':'+parent.model+':'+parent.id;

		lookupKey += ':'+Model._spec[modelName].namespace;

		var acceptedProps = {};

		for(var prop in Model._spec[modelName].properties) {
			if (Model._spec[modelName].properties.hasOwnProperty(prop)) {
				acceptedProps[prop] = props[prop];
			}
		}

		acceptedProps.author = user_id;
		if (parent) acceptedProps.parent = parent.id;

		var insertResults = null;

		Application.bucket.insert(directKey, acceptedProps, function(err1, results1) {
			if (err1) {
				cb(err1, null); return;
			}

			Application.bucket.append(lookupKey, idx+',', cb);
		});

		/*Model._dbBucket.get(relatedKey, function(err1, results1) {
			if (err1) {
				Model._dbBucket.append(relatedKey, idx+',', function(err2, results2) {
					if (err2) {
						cb(err2, null); return;
					}
				});
			} else {
				Model._dbBucket.update(relatedKey, {ids: results1.value.ids.append(idx)}, function(err2, resultd2) {
					if (err2) {
						cb(err2, null); return;
					}
				});
			}
		});*/
	});
};

Model.increment = function(modelName, context, delta, cb) {
	var countKey = 'blg:'+context+':'+Model._spec[modelName].namespace+':count';

	Application.bucket.counter(countKey, delta, cb);
};

Model.incrementWithParent = function(modelName, context, delta, parent, cb) {
	var countKey = 'blg:'+context+':';

	countKey += parent.model+':'+parent.id;
	countKey += ':'+Model._spec[modelName].namespace+'_count';

	Application.bucket.counter(countKey, delta, cb);
};

/**
 *
 * @param props changed properties of the model
 * @param user_id author of the model
 * @param parent parent of the model ({name, id} object)
 * @param cb
 */
Model.update = function(modelName, props, user_id, parent, cb) {
	var id = props._id;

	var directKey = 'blg:'+Model._spec[modelName].namespace+':'+id;
	var lookupKey = 'blg:user:'+user_id;

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
		Application.bucket.get(lookupKey, function(err, results){
			if (err) {
				cb(err, null);
				return;
			}

			var destinationLookupKey = 'blg:user:'+user_id;

			//we want to change the parent only if it already has
			if (props._parent && parent) {
				destinationLookupKey += ':'+props._parent.model+':'+props._parent.id;
				acceptedProps.parent = props._parent.id;
			} else if (parent)
				destinationLookupKey += ':'+parent.model+':'+parent.id;

			destinationLookupKey += ':'+Model._spec[modelName].namespace;

			results = JSON.parse('['+results.value.substr(0, results.value.length-1)+']');
			var idx = results.indexOf(id);

			Application.bucket.replace(lookupKey, results.splice(idx, 1).toString()+',', cb);
			Application.bucket.append(destinationLookupKey, id+',');
		});
	}

	//parent changed, must update related keys as well
	/*if (parent){
		acceptedProps.parent = parent.id;
		Model._dbBucket.get(lookupKey, function(err, results){
			if (err) {
				cb(err, null);
				return;
			}

			var destinationLookupKey = 'blg:user:'+user_id;

			destinationLookupKey += ':'+parent.model+':'+parent.id;
			destinationLookupKey += ':'+Model._namespace;

			results = JSON.parse('['+results.value.substr(0, results.value.length-1)+']');
			var idx = results.indexOf(id);

			Model._dbBucket.replace(lookupKey, results.splice(idx, 1).toString()+',', cb);
			Model._dbBucket.append(destinationLookupKey, id+',');
		});
	}*/

	Application.bucket.replace(directKey, acceptedProps, cb);
};

module.exports = Model;
