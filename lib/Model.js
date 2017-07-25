let Application = require('./Application.js');
let User = require('./User');
let Context = require('./Context');
let TelepatError = require('./TelepatError');
let async = require('async');
let utils = require('../utils/utils');
let FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
let guid = require('uuid');
let Services = require('./Services');
let BaseModel = require('./BaseModel');

class Model extends BaseModel {
	
	constructor(props) {
		let validationCheck = Application.isValid(props.application_id, props.type);

		if(validationCheck instanceof TelepatError) {
			return validationCheck;
		}

		const proxiedParent = super(props, ['context_id', 'application_id', 'user_id', 'parent_info']);

		return proxiedParent;
	}

	static get(id, callback) {
		Services.datasource.dataStorage.getObjects([id], (errs, results) => {
			if (errs.length) {
				 return callback(errs[0]);
			}
			callback(null, results[0]);
		});
	}

	static new(deltas, callback, returnedObjectsCb) {
		let curatedDeltas = [];
		let objParentInfo = {};

		let builtinModels = Application.builtinModels;

		async.series([
			(callback1) => {
				async.forEachOf(deltas, (d, i, c) => {
					deltas[i].object.id = guid.v4();
					let object = new Model(deltas[i].object);
					let validationCheck = Application.isValid(object.application_id, object.type);						if(validationCheck instanceof TelepatError) {
						return c();
					}

					let parent = Model.getParent(object);

					if(parent && parent.id) {
						objParentInfo[parent.id] = parent;
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
									return ;
								let appModels = Application.apps[result.application_id].schema;
								if (objParentInfo[result.id].parentRelationKey)
									objParentInfo[result.id].relationKeyLength = result[appModels[result.type].hasSome_property].length;
							});
							deltas.forEach((delta, i) => {
								let obj = delta.object;
								let check = Application.isValid(obj.application_id, obj.type);
		
								if(check instanceof TelepatError) {
									return;

								}
								let appModels = Application.apps[obj.application_id].schema;
								let parent = getParent(obj);

								if (!parent) {
									curatedDeltas.push(delta);
									return;
								}

								if (obj[appModels[obj.type].hasSome_property] &&
									obj[appModels[obj.type].hasSome_property].length <= objParentInfo[obj.id].relationKeyLength) {

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

				curatedDeltas.forEach( (d) => {
					dbItems.push(d.object);
				});

				let appModelsObjects = [];

				async.eachSeries(dbItems, (item, c) => {
					appModelsObjects.push(item);
					c();
				},
				() => {
					if (appModelsObjects.length > 0)
						Services.datasource.dataStorage.createObjects(appModelsObjects, (errs, result) => {});
					callback1();
				});
			}
		], callback);
	}


	static update(patches, callback)  {
		let appModelsPatches = [];
		let userPatches = [];
		let contextPatches = [];

		async.eachSeries(patches, (p, c) => {
			let modelType = p.path.split('/')[0];

			if (!(modelType == 'user' || modelType == 'admin' || modelType == 'context' || modelType == 'application')) {
				appModelsPatches.push(p);
			}
			c();
		}, () => {
			if (appModelsPatches.length) {
				Services.datasource.dataStorage.updateObjects(appModelsPatches, (errs) => {
					if (errs && errs.length >= 1) {}
					errs.forEach( (error) => {
						if (error.status == 404) {
							Services.logger.notice(error.message);
						}
						else {
							Services.logger.error(error.toString());
						}
					});
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
					if (modelName == 'context')
						Context.delete(id, () => {});
					else
						appModels[id] = modelName;
					c();
				}, callback1);
			},
			(callback1) => {
				Services.datasource.dataStorage.deleteObjects(appModels, (errs) => {
					if (errs && errs.length >= 1) {
						async.each(errs, (error, c) => {
							if (error.status == 404) {
								Services.logger.notice('Model "'+error.args[0]+'" with ID "'+error.args[1]+'" not found.');
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
					let  modelName = appModels[id];
					let filterObj = {};

					filterObj[modelName+'_id'] = id;
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
							Services.datasource.dataStorage.deleteObjects(deleteObjects, (errs) => {});
						});
					};
					Services.datasource.dataStorage.searchObjects({filters: childrenFilter, fields: ['id', 'type'], scanFunction: deleteChildObjects}, callback1);
				} else {
					callback1();
				}
			}
		]);
		callback();
	}


	static getFilterFromChannel(channel) {
		let searchFilters = new FilterBuilder();

		searchFilters.addFilter('is', {application_id: channel.appId});

		if (channel.props.context) {
			searchFilters.addFilter('is', {context_id: channel.props.context});
		}
		if (channel.props.user) {
			searchFilters.addFilter('is', {user_id: channel.props.user});
		}

		if(channel.props.parent) {
			let filterObj = {};
			filterObj[channel.props.parent.model+'_id'] = channel.props.parent.id;
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
	}

	static modelCountByChannel(channel, aggregation, callback) {
		let cachingKey = channel.get();

		if (aggregation)
			cachingKey += (new Buffer(JSON.stringify(aggregation))).toString('base64');

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
						Services.redisCacheClient.set([cachingKey+':LOCK', '1', 'NX'], (err, result) => {
							if (err) return callback1(err);

							if(result !== null) {
								let countFilters = Model.getFilterFromChannel(channel);
								Services.countObjects({modelName: channel.props.model, filters: filters, aggregation: aggregation}, (err1, count) => {
									if (err1) return callback1(err1);

									let tranzaction = Services.redisCacheClient.multi();
									tranzaction.set([cachingKey, JSON.stringify(count), 'EX', 300]);
									tranzaction.del(cachingKey+':LOCK');

									tranzaction.exec( (err2) => {
										if (err2) {
											Services.redisCacheClient.del([cachingKey+':LOCK'], () => {
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
	}

	static search(channel, sort, offset, limit, callback) {
		let searchFilters = Model.getFilterFromChannel(channel);

		Services.searchObjects({
			filters: searchFilters,
			modelName: channel.props.model,
			sort: sort,
			offset: offset,
			limit: limit || Services.datasource.dataStorage.config.subscribe_limit

		}, callback);
	}

	static getParent(object) {
		let application_id = object.application_id;
		let modelName = object.type;
		if(Application.isValid(application_id, modelName)) {
			return Application.isValid(application_id, modelName);
		}
		let appModels = Application.apps[application_id].schema;
		let parent, relationType;

		if (!appModels[modelName].belongsTo) {
			return;
		}
		for(let r in appModels[modelName].belongsTo) {
			if(object[appModels[modelName].belongsTo[r].parentModel + '_id']) {
				parent = {
					model: appModels[modelName].belongsTo[r].parentModel,
					id: object[appModels[modelName].belongsTo[r].parentModel + '_id'],
				};
				relationType = appModels[modelName].belongsTo[r].relationType;
			}
		}
		let objParentInfo;
		
		if(parent) {
			let parentRelationKey;
						
			if(relationType == 'hasSome') {
				parentRelationKey = object[appModels[parent.model].hasSome_property+'index'];
			}
			
			objParentInfo  = {
				model: parent.model,
				parentRelationKey: parentRelationKey,
				id: parent.id,
			};
		}
		return objParentInfo;

	}
}

module.exports = Model;