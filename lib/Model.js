var Application = require('./Application');
var TelepatError = require('./TelepatError');
var async = require('async');
var utils = require('../utils/utils');
var FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
var guid = require('uuid');
/**
 * Retrieves a single item of a certain type
 * @param name Name of the model/type
 * @param appId ID of the app of the model
 * @param _id ID of the item
 * @param callback
 * @constructor
 */
function Model(name, appId, context_id, _id, callback) {
	if (!Application.loadedAppModels[appId]) {
		return callback(new TelepatError(TelepatError.errors.ApplicationNotFound, [appId]));
	}
	if (!Application.loadedAppModels[appId].schema[name]) {
		return callback(new TelepatError(TelepatError.errors.ApplicationSchemaModelNotFound, [appId, name]));
	}

	Application.datasource.dataStorage.getObjects([_id], function(errs, result) {
		if (errs.length) return callback(errs[0]);
		callback(null, results[0]);
	});
}

Model.delete = function(objects, callback) {
	var childrenFilter = new FilterBuilder('or');

	async.series([
		function(callback1) {
			Application.datasource.dataStorage.deleteObjects(objects, function(errs) {
				if (errs && errs.length >= 1)
					errs.forEach(function(error) {
						Application.logger.notice('Model "'+error.args[0]+'" with ID "'+error.args[1]+'" not found.');
						delete objectsToDelete[error.args[1]];
					});
			});
		},
		function(callback1) {
			async.each(Object.keys(objects), function(id, c) {
				var modelName = objects[id];
				var filterObj = {};

				filterObj[modelName+'_id'] = id;
				childrenFilter.addFilter('is', filterObj);
				c();
			}, callback1);
		},
		function(callback1) {
			if (!childrenFilter.isEmpty()) {
				var deleteChildObjects = function(obj) {
					var deleteObjects = {};

					async.each(obj, function(o, c) {
						deleteObjects[o.id] = o.type;
						c();
					}, function() {
						Application.datasource.dataStorage.deleteObjects(deleteObjects, function(errs) {});
					});
				};
				Application.datasource.dataStorage.searchObjects({filters: childrenFilter, fields: ['id', 'type'], scanFunction: deleteChildObjects}, callback1);
			}
			else
				callback1();
		}
	], callback)
};

/**
 * Used for unique IDs
 * @param modelName
 * @param callback
 */
Model.count = function(modelName, appId, callback) {
	var filter = new FilterBuilder();
	filter.addFilter('is', {application_id: appId});
	Application.datasource.dataStorage.countObjects({modelName: modelName, filters: filter}, callback);
}

Model.create = function(objects, callback) {
	var curatedObjects = [];
	var appModels = Application.loadedAppModels[objects[i].application_id].schema;

	var objParentInfo = {};

	async.series([
		function(callback1) {
			async.forEachOf(objects, function(obj, i, c) {
				objects[i].id = guid.v4();
				objects[i].created = Math.floor((new Date()).getTime()/1000);
				objects[i].modified = obj.created;
				var modelName = objects[i].type;

				for (var r in appModels[modelName].belongsTo) {
					if (objects[i][appModels[modelName].belongsTo[r].parentModel + '_id']) {
						var parent = {
							model: appModels[modelName].belongsTo[r].parentModel,
							id: objects[i][appModels[modelName].belongsTo[r].parentModel + '_id']
						};
						var relationType = appModels[modelName].belongsTo[r].relationType;
					}
				}

				if (!parent)
					return c();

				if (relationType == 'hasSome') {
					var parentRelationKey = objects[i][appModels[parent.model].hasSome_property+'_index'];
				}

				objParentInfo[parent.id] = {
					model: parent.model,
					parentRelationKey: parentRelationKey
				};

				c();
			}, callback1);
		}, function(callback1) {
			Application.datasource.dataStorage.getObjects(Object.keys(objParentInfo), function(errs, results) {
				if (errs && errs.length >= 1) {
					errs.forEach(function(error) {
						if (error && error.status == 404) {
							Application.logger.warning((new TelepatError(TelepatError.errors.ParentObjectNotFound, [error.args[0], error.args[1]])).message);
							delete objParentInfo[error.args[1]];
						} else {
							return callback1(error);
						}
					});
				}
				if (results && results.length >= 1) {
					results.forEach(function(result) {
						objParentInfo[result.id].relationKeyLength = result[objParentInfo[result.id].parentRelationKey].length;
					});
					objects.forEach(function(obj, i) {
						for (var r in appModels[obj.type].belongsTo) {
							if (appModels[obj.type].belongsTo[r].relationType == 'hasSome' && objects[i][appModels[obj.type].belongsTo[r].parentModel + '_id']) {
								var parent = {
									model: appModels[obj.type].belongsTo[r].parentModel,
									id: objects[i][appModels[obj.type].belongsTo[r].parentModel + '_id']
								};
							}
						}

						if (!parent) {
							curatedObjects.push(obj);
							return;
						}

						if (obj[appModels[obj.type].hasSome_property] &&
							obj[appModels[obj.type].hasSome_property].length <= objParentInfo[obj.id].relationKeyLength) {

							Application.logger.warning((new TelepatError(TelepatError.errors.InvalidObjectRelationKey,
								[
									objParentInfo[obj.id].parentRelationKey,
									objParentInfo[obj.id].relationKeyLength
								])).message);

						} else
							curatedObjects.push(obj);
					});
				}
				callback1();
			});
		}, function(callback1) {
			Application.datasource.dataStorage.createObjects(curatedObjects, function(err) {
				if (err) return callback1(err);
			});
		}
	], function(err) {
		if (err) return callback(err);
		callback(null, curatedObjects);
	});
};

/**
 * Updates and item
 * @param props changed properties of the model
 * @param user_id author of the model
 * @param parent parent of the model ({name, id} object)
 * @param cb
 */
Model.update = function(patches, callback) {
	Application.datasource.dataStorage.updateObjects(patches, function(errs) {
		if (errs && errs.length >= 1) {}
		errs.forEach(function(error) {
			if (error.status == 404)
				Application.logger.warning(error.message);
			else
				Application.logger.error(error.toString());
		});
		callback();
	});
};

Model.getFilterFromChannel = function(channel) {
	var searchFilters = new FilterBuilder();

	searchFilters.addFilter('is', {application_id: channel.appId});

	if (channel.props.context)
		searchFilters.addFilter('is', {context_id: channel.props.context});

	if (channel.props.user) {
		searchFilters.addFilter('is', {user_id: channel.props.user});
	}

	if(channel.props.parent) {
		var filterObj = {};
		filterObj[channel.props.parent.model+'_id'] = channel.props.parent.id;
		searchFilters.addFilter('is', filterObj);
	}

	if (channel.filter) {
		channel.filter = utils.parseQueryObject(channel.filter);
		searchFilters.and();
		(function AddFilters(filterObject) {
			var filterKey = Object.keys(filterObject);
			searchFilters[filterKey]();

			filterObject[filterKey].forEach(function(f, key) {
				if (key == 'and' || key == 'or')
					AddFilters(filterObject[filterKey]);
				else
					searchFilters.addFilter(key, filterObject[filterKey][f]);
			});
			searchFilters.end();
		})(channel.filter);
	}

	return searchFilters;
};

Model.search = function(channel, sort, offset, limit, callback) {
	var searchFilters = Model.getFilterFromChannel(channel);

	Application.datasource.dataStorage.searchObjects({filters: searchFilters, modelName: channel.props.model, sort: sort,  offset: offset, limit: limit}, callback);
};

Model.modelCountByChannel = function(channel, aggregation, callback) {
	var cachingKey = channel.get();

	if (aggregation)
		cachingKey += (new Buffer(JSON.stringify(aggregation))).toString('base64');

	cachingKey += ':count_cache';

	var waterfall = function(waterfallCallback) {
		async.waterfall([
			function(callback1) {
				Application.redisCacheClient.get(cachingKey, callback1);
			},
			function(result, callback1) {
				if (result) {
					callback1(null, JSON.parse(result));
				} else {
					//incearca sa creeze 2nd key
					//if (OK) get from ES & (unset)set redis key
					//else (null, adica nu exista 2nd redis key) retry
					Application.redisCacheClient.set([cachingKey+':LOCK', '1', 'NX'], function(err, result) {
						if (err) return callback1(err);

						if(result !== null) {
							var countFilters = Model.getFilterFromChannel(channel);
							Application.datasource.dataStorage.countObjects({modelName: channel.props.model, filters: filters, aggregation: aggregation}, function(err1, count) {
								if (err1) return callback1(err1);

								var tranzaction = Application.redisCacheClient.multi();
								tranzaction.set([cachingKey, JSON.stringify(count), 'EX', 300]);
								tranzaction.del(cachingKey+':LOCK');

								tranzaction.exec(function(err2) {
									callback1(err2, count);
								});
							});
						} else {
							setTimeout(waterfall, 100);
						}
					});
				}
			}
		], waterfallCallback);
	};

	waterfall(callback);
};

module.exports = Model;
