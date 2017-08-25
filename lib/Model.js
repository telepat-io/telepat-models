'use strict';
let Application = require('./Application.js');
let TelepatError = require('./TelepatError');
let async = require('async');
let FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
let guid = require('uuid');
let Services = require('./Services');
let BaseModel = require('./BaseModel');

class Model extends BaseModel {
	constructor(props) {
		let validationCheck = Application.apps[props.application_id].modelSchema(props.type).isValidModel(props.application_id);

		let immutableProps = ['context_id', 'application_id', 'user_id'];

		if (validationCheck instanceof TelepatError) {
			return validationCheck;
		}

		let parentProps = Model.getParentInfo(props) || false;

		for (let prop in parentProps) {
			props['parent_' + prop] = parentProps[prop];
			immutableProps.push('parent_' + prop);
		}

		const proxiedParent = super(props, immutableProps);

		return proxiedParent;
	}

	static get(id, callback) {
		Services.datasource.dataStorage.getObjects([id], (errs, results) => {
			if (errs.length) {
				return callback(errs[0]);
			}
			callback(null, new Model(results[0].properties));
		});
	}

	static hasSome(object) {
		let appModels = Application.apps[object.application_id].schema;

		if (appModels[object.type] && appModels[object.type].hasSome_property) {
			return appModels[object.type].hasSome_property;

		}

		return false;
	}

	static new(deltas, callback, returnedObjectsCb) {
		let curatedDeltas = [];
		let objParentInfo = {};

		async.series([
			(callback1) => {
				async.forEachOf(deltas, (d, i, c) => {
					deltas[i].object.id = guid.v4();
					let object = new Model(deltas[i].object);

					if (object instanceof TelepatError) {
						return c();
					}
					let parentInfo = Model.getParentInfo(object);

					if (parentInfo && parentInfo.id) {
						objParentInfo[parentInfo.id] = parentInfo;
					}

					c();
				}, callback1);
			},
			(callback1) => {
				if (!Object.keys(objParentInfo).length) {
					curatedDeltas = deltas;
					callback1();
				} else {
					Services.datasource.dataStorage.getObjects(Object.keys(objParentInfo), (errs, results) => {
						if (errs && errs.length >= 1) {
							errs.forEach((error) => {
								if (error && error.status == 404) {
									Services.logger.warning((new TelepatError(TelepatError.errors.ParentObjectNotFound, [error.args[0], error.args[1]])).message);
									delete objParentInfo[error.args[1]];
								} else {
									return callback1(error);
								}
							});
						}
						if (results && results.length >= 1) {
							results.forEach((result) => {
								if (!Application.apps[result.application_id] || !Application.apps[result.application_id].schema)
									return;

								let appModels = Application.apps[result.application_id].schema;

								if (objParentInfo[result.id].parentRelationKey)
									objParentInfo[result.id].relationKeyLength = result[Model.hasSome(result)].length;
							});
							deltas.forEach((delta) => {
								let obj = delta.object;

								if (Application.apps[obj.application_id].modelSchema(obj.type).isValidModel() instanceof TelepatError) {
									return;
								}

								let appModels = Application.apps[obj.application_id].schema;
								let parent = Model.getParentInfo(obj);

								if (!parent) {
									curatedDeltas.push(delta);
									return;
								}

								if (obj[Model.hasSome(obj)] &&
									obj[Model.hasSome(obj)].length <= objParentInfo[obj.id].relationKeyLength) {

									Services.logger.warning((new TelepatError(TelepatError.errors.InvalidObjectRelationKey,
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
			},
			(callback1) => {
				returnedObjectsCb(curatedDeltas);

				let dbItems = [];

				curatedDeltas.forEach((d) => {
					dbItems.push(d.object);
				});

				let appModelsObjects = [];

				async.eachSeries(dbItems, (item, c) => {
					appModelsObjects.push(item);
					c();
				},
					() => {
						if (appModelsObjects.length > 0)
							Services.datasource.dataStorage.createObjects(appModelsObjects, () => { });
						callback1();
					});
			}
		], callback);
	}


	static update(patches, callback) {
		let appModelsPatches = [];

		async.eachSeries(patches, (p, c) => {
			let modelType = p.path.split('/')[0];

			if (!Application.isBuiltInModel(modelType)) {
				appModelsPatches.push(p);
			} else {
				Services.logger.warning("Cannot update builtin model", modelType);
			}
			c();
		}, () => {
			if (appModelsPatches.length) {
				Services.datasource.dataStorage.updateObjects(appModelsPatches, (errs) => {
					if (errs && errs.length >= 1) {
						errs.forEach((error) => {
							if (error.status == 404) {
								Services.logger.notice(error.message);
							}
							else {
								Services.logger.error(error.toString());
							}
						});
					}
				});
			}
			callback();
		});
	}

	static delete(objects, callback) {
		let childrenFilter = new FilterBuilder('or');

		let appModels = {};

		async.series([
			(callback1) => {
				async.forEachOfSeries(objects, (modelName, id, c) => {
					if (!Application.isBuiltInModel(modelName)) {
						appModels[id] = modelName;
					} else {
						Services.logger.warning("Cannot delete builtin model", modelName);
					}
					c();
				}, callback1);
			},
			(callback1) => {
				Services.datasource.dataStorage.deleteObjects(appModels, (errs) => {
					if (errs && errs.length >= 1) {
						async.each(errs, (error, c) => {
							if (error.status == 404) {
								Services.logger.notice('Model "' + error.args[0] + '" with ID "' + error.args[1] + '" not found.');
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
			(callback1) => {
				async.each(Object.keys(appModels), (id, c) => {
					let modelName = appModels[id];
					let filterObj = {};

					filterObj[modelName + '_id'] = id;
					childrenFilter.addFilter('is', filterObj);
					c();
				}, callback1);
			},
			(callback1) => {
				if (!childrenFilter.isEmpty()) {
					let deleteChildObjects = (obj) => {
						let deleteObjects = {};

						async.each(obj, (o, c) => {
							deleteObjects[o.id] = o.type;
							c();
						}, () => {
							Services.datasource.dataStorage.deleteObjects(deleteObjects, () => { });
						});
					};
					Services.datasource.dataStorage.searchObjects({ filters: childrenFilter, fields: ['id', 'type'], scanFunction: deleteChildObjects }, callback1);
				} else {
					callback1();
				}
			}
		]);
		callback();
	}


	static count(appId, modelName, callback) {
		let filter = new FilterBuilder();

		filter.addFilter('is', { application_id: appId });
		Services.datasource.dataStorage.countObjects({ modelName: modelName, filters: filter }, callback);
	}

	static getFilterFromChannel(channel) {
		let searchFilters = new FilterBuilder();

		searchFilters.addFilter('is', { application_id: channel.appId });

		if (channel.props.context) {
			searchFilters.addFilter('is', { context_id: channel.props.context });
		}
		if (channel.props.user) {
			searchFilters.addFilter('is', { user_id: channel.props.user });
		}

		if (channel.props.parent) {
			let filterObj = {};

			filterObj[channel.props.parent.model + '_id'] = channel.props.parent.id;
			searchFilters.addFilter('is', filterObj);
		}

		if (channel.filter) {
			(function AddFilters(filterObject) {
				let filterKey = Object.keys(filterObject);

				if (filterKey == 'or')
					searchFilters.or();
				else if (filterKey == 'and')
					searchFilters.and();

				filterObject[filterKey].forEach((filters, key) => {
					if (key == 'and' || key == 'or') {
						AddFilters(filterObject[filterKey]);
					}
					else {
						for (var key2 in filters) {
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
	}

	static modelCountByChannel(channel, aggregation, callback) {
		let cachingKey = channel.get();

		if (aggregation) {
			cachingKey += (new Buffer(JSON.stringify(aggregation))).toString('base64');
		}

		cachingKey += ':count_cache';

		let filters = Model.getFilterFromChannel(channel);

		let waterfall = (waterfallCallback) => {
			async.waterfall([
				(callback1) => {
					Services.redisCacheClient.get(cachingKey, callback1);
				},
				(result, callback1) => {
					if (result) {
						callback1(null, JSON.parse(result));
					} else {
						async.waterfall([
							(callback2) => {
								Services.redisCacheClient.set([cachingKey + ':LOCK', '1', 'NX'], callback2);
							},
							(redisResult, callback2) => {
								if (redisResult !== null) {
									Services.datasource.dataStorage.countObjects({ modelName: channel.props.model, filters: filters, aggregation: aggregation }, callback2);
								} else {
									setTimeout(waterfall, 100);
								}
							},
							(count, callback2) => {
								let tranzaction = Services.redisCacheClient.multi();

								tranzaction.set([cachingKey, JSON.stringify(count), 'EX', 300]);
								tranzaction.del(cachingKey + ':LOCK');

								tranzaction.exec((err2) => {
									if (err2) {
										Services.redisCacheClient.del([cachingKey + ':LOCK'], () => {
											callback2(null, count);
										});
									} else {
										callback2(err2, count);
									}
								});
							}], callback1);
					}
				}
			], waterfallCallback);
		};

		waterfall(callback);
	}


	static search(channel, sort, offset, limit, callback) {
		let searchFilters = Model.getFilterFromChannel(channel);

		Services.datasource.dataStorage.searchObjects({
			filters: searchFilters,
			modelName: channel.props.model,
			sort: sort,
			offset: offset,
			limit: limit || Services.datasource.dataStorage.config.subscribe_limit

		}, callback);
	}

	static getParentInfo(object) {
		let appId = object.application_id;
		let modelName = object.type;
		let validationCheck = Application.apps[appId].modelSchema(modelName).isValidModel();

		if (validationCheck instanceof TelepatError) {
			return validationCheck;
		}

		let appModels = Application.apps[appId].schema;
		let parent, relationType;

		if (!appModels[modelName].belongsTo) {
			return;
		}


		for (let r in appModels[modelName].belongsTo) {
			if (object[appModels[modelName].belongsTo[r].parentModel + '_id']) {
				parent = {
					model: appModels[modelName].belongsTo[r].parentModel,
					id: object[appModels[modelName].belongsTo[r].parentModel + '_id'],
				};
				relationType = appModels[modelName].belongsTo[r].relationType;
			}
		}

		let objParentInfo;

		if (parent) {
			let parentRelationKey;

			if (relationType == 'hasSome') {
				parentRelationKey = object[Model.hasSome({ type: parent.model, application_id: appId }) + 'index'];

			}

			if(!parentRelationKey && Application.apps[appId].modelSchema(parent.model).hasSome(object.type)) {
				return (new TelepatError(TelepatError.errors.MissingRequiredField, [parent.parentRelationKey]));
			}

			objParentInfo = {
				model: parent.model,
				parentRelationKey: parentRelationKey,
				id: parent.id,
			};
		}
		return objParentInfo;
	}

	static validateObject(content) {
		let parent = Model.getParentInfo(content);
		
		if (parent instanceof TelepatError) {
			return parent;
		}
		
		if (parent) {
			if (parent.parentRelationKey && !content[parent.parentRelationKey]) {
				return (new TelepatError(TelepatError.errors.MissingRequiredField, [parent.parentRelationKey]));
			}

			if (parent.id) {
				return true;
			}

			return new TelepatError(TelepatError.errors.MissingRequiredField, ['id']);
		}


		return true;
	}
}

module.exports = Model;