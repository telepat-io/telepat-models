var Application = require('./Application');
var User = require('./User');
var Context = require('./Context');
var TelepatError = require('./TelepatError');
var async = require('async');
var utils = require('../utils/utils');
var FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
var guid = require('uuid');
/**
 * Retrieves a single item
 * @param _id ID of the item
 * @param callback
 * @constructor
 */
function Model(_id, callback) {
	Application.datasource.dataStorage.getObjects([_id], function(errs, results) {
		if (errs.length) return callback(errs[0]);
		callback(null, results[0]);
	});
}

Model.delete = function(objects, callback) {
	var childrenFilter = new FilterBuilder('or');

	var appModels = {};

	async.series([
		function(callback1) {
			async.forEachOfSeries(objects, function(modelName, id, c) {
				if (modelName == 'context')
					Context.delete(id, function() {});
				else
					appModels[id] = modelName;
				c();
			}, callback1);
		},
		function(callback1) {
			Application.datasource.dataStorage.deleteObjects(appModels, function(errs) {
				if (errs && errs.length >= 1) {
					async.each(errs, function(error, c) {
						if (error.status == 404) {
							Application.logger.notice('Model "'+error.args[0]+'" with ID "'+error.args[1]+'" not found.');
							delete appModels[error.args[1]];
							c();
						} else {
							c(error);
						}
					}, callback1);
				} else
					callback1();
			});
		},
		function(callback1) {
			async.each(Object.keys(appModels), function(id, c) {
				var modelName = appModels[id];
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
	]);
	callback();
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

Model.create = function(deltas, callback, returnedObjectsCb) {
	var curatedDeltas = [];
	var objParentInfo = {};

	var builtinModels = ['application', 'admin', 'user', 'user_metadata', 'context'];

	async.series([
		function(callback1) {
			async.forEachOf(deltas, function(d, i, c) {
				var object = deltas[i].object;
				object.id = guid.v4();
				object.created = Math.floor((new Date()).getTime()/1000);
				object.modified = object.created;

				var modelName = object.type;

				if (!Application.loadedAppModels[object.application_id] || !Application.loadedAppModels[object.application_id].schema)
					return c();
				var appModels = Application.loadedAppModels[object.application_id].schema;

				if (builtinModels.indexOf(modelName) !== -1)
					return c();

				for (var r in appModels[modelName].belongsTo) {
					if (object[appModels[modelName].belongsTo[r].parentModel + '_id']) {
						var parent = {
							model: appModels[modelName].belongsTo[r].parentModel,
							id: object[appModels[modelName].belongsTo[r].parentModel + '_id']
						};
						var relationType = appModels[modelName].belongsTo[r].relationType;
					}
				}

				if (!parent)
					return c();

				if (relationType == 'hasSome') {
					var parentRelationKey = object[appModels[parent.model].hasSome_property+'_index'];
				}

				objParentInfo[parent.id] = {
					model: parent.model,
					parentRelationKey: parentRelationKey
				};

				c();
			}, callback1);
		}, function(callback1) {
			if (!Object.keys(objParentInfo).length) {
				curatedDeltas = deltas;
				callback1();
			} else {
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
							if (!Application.loadedAppModels[result.application_id] || !Application.loadedAppModels[result.application_id].schema)
								return ;
							var appModels = Application.loadedAppModels[result.application_id].schema;
							if (objParentInfo[result.id].parentRelationKey)
								objParentInfo[result.id].relationKeyLength = result[appModels[result.type].hasSome_property].length;
						});
						deltas.forEach(function(delta, i) {
							var obj = delta.object;
							var appModels = Application.loadedAppModels[obj.application_id].schema;

							if (!Application.loadedAppModels[obj.application_id] || !Application.loadedAppModels[obj.application_id].schema)
								return ;

							if (builtinModels.indexOf(obj.type) !== -1) {
								curatedDeltas.push(delta);
								return;
							}

							for (var r in appModels[obj.type].belongsTo) {
								if (appModels[obj.type].belongsTo[r].relationType == 'hasSome' && obj[appModels[obj.type].belongsTo[r].parentModel + '_id']) {
									var parent = {
										model: appModels[obj.type].belongsTo[r].parentModel,
										id: obj[appModels[obj.type].belongsTo[r].parentModel + '_id']
									};
								}
							}

							if (!parent) {
								curatedDeltas.push(delta);
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
								curatedDeltas.push(delta);
						});
					}
					callback1();
				});
			}
		}, function(callback1) {
			returnedObjectsCb(curatedDeltas);

			var dbItems = [];

			curatedDeltas.forEach(function(d) {
				dbItems.push(d.object);
			});

			var appModelsObjects = [];

			async.eachSeries(dbItems, function(item, c) {
				if (item.type == 'user') {
					User.create(item, item.application_id, function(){});
				}
				else if (item.type == 'context')
					Context.create(item, function(){});
				else
					appModelsObjects.push(item);
				c();
			}, function() {
				if (appModelsObjects.length > 0)
					Application.datasource.dataStorage.createObjects(appModelsObjects, function(errs, result) {});

				callback1();
			});
		}
	], callback);
};

/**
 * Updates and item
 * @param props changed properties of the model
 * @param user_id author of the model
 * @param parent parent of the model ({name, id} object)
 * @param cb
 */
Model.update = function(patches, callback) {
	var appModelsPatches = [];
	var userPatches = [];
	var contextPatches = [];

	async.eachSeries(patches, function(p, c) {
		if (p.path.split('/')[0] == 'user')
			userPatches.push(p);
		else if (p.path.split('/')[0] == 'context')
			contextPatches.push(p);
		else
			appModelsPatches.push(p);
		c();
	}, function() {
		if (appModelsPatches.length) {
			Application.datasource.dataStorage.updateObjects(appModelsPatches, function(errs) {
				if (errs && errs.length >= 1) {}
				errs.forEach(function(error) {
					if (error.status == 404)
						Application.logger.notice(error.message);
					else
						Application.logger.error(error.toString());
				});
			});
		}

		if (userPatches.length) {
			User.update(userPatches, function(err){
				if (err)
					Application.logger.error(err);
			});
		}

		if (contextPatches.length) {
			Context.update(contextPatches, function(err) {
				if (err)
					Application.logger.error(err);
			});
		}

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
		(function AddFilters(filterObject) {
			var filterKey = Object.keys(filterObject);
			if (filterKey == 'or')
				searchFilters.or();
			else if (filterKey == 'and')
				searchFilters.and();

			filterObject[filterKey].forEach(function(filters, key) {
				if (key == 'and' || key == 'or')
					AddFilters(filterObject[filterKey]);
				else {
					for(var key2 in filters) {
						if (key2 == 'and' || key2 == 'or') {
							AddFilters(filters);
						} else {
							searchFilters.addFilter(key2, filters[key2]);
						}
					}
				}
			});
			searchFilters.end();
		})(channel.filter);
	}

	return searchFilters;
};

Model.search = function(channel, sort, offset, limit, callback) {
	var searchFilters = Model.getFilterFromChannel(channel);

	Application.datasource.dataStorage.searchObjects({
		filters: searchFilters,
		modelName: channel.props.model,
		sort: sort,
		offset: offset,
		limit: limit || Application.datasource.dataStorage.config.subscribe_limit
	}, callback);
};

Model.modelCountByChannel = function(channel, aggregation, callback) {
	var cachingKey = channel.get();

	if (aggregation)
		cachingKey += (new Buffer(JSON.stringify(aggregation))).toString('base64');

	cachingKey += ':count_cache';

	var filters = Model.getFilterFromChannel(channel);

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
									if (err2) {
										Application.redisCacheClient.del([cachingKey+':LOCK'], function() {
											callback1(null, count);
										});
									} else
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
