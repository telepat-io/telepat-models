"use strict";
let Main_Database_Adapter = require('./main_database_adapter');
let elasticsearch = require('elasticsearch');
let async = require('async');
let Delta = require('../Delta');
let TelepatError = require('../TelepatError');
let AgentKeepAlive = require('agentkeepalive');
let cloneObject = require('clone');
let BuilderNode = require('../../utils/filterbuilder').BuilderNode;
let Services = require('../Services');
let Model = require('../Model');
require('colors');

let builtinModels = {
	user: require('../User'),
	application: require('../Application'),
	context: require('../Context'),
	admin: require('../Admin')
};

class ElasticSearchDB extends Main_Database_Adapter {
	constructor(config) {
		let esConfig = {
			apiVersion: '1.7',
			keepAlive: true,
			maxSockets: 300,
			createNodeAgent(connection, config) {
				return new AgentKeepAlive(connection.makeAgentConfig(config));
			}
		};

		if (config.hosts) {
			esConfig.hosts = config.hosts;
		} else if (config.host) {
			esConfig.host = config.host;
			esConfig.port = config.port;
			esConfig.sniffOnStart = true;
			esConfig.sniffInterval = 30000;
			esConfig.sniffOnConnectionFault = true;
		}
		super(new elasticsearch.Client(esConfig));

		this.config = config;

		this.config.subscribe_limit = this.config.subscribe_limit || 64;
		this.config.get_limit = this.config.get_limit || 384;

		let retryConnection = () => {
			//we had to copy paste the config letiable because the es sdk doesn't allow to reuse the config object
			esConfig = {
				apiVersion: '1.7',
				keepAlive: true,
				maxSockets: 300,
				createNodeAgent(connection, config) {
					return new AgentKeepAlive(connection.makeAgentConfig(config));
				}
			};

			if (this.config.hosts)
				esConfig.hosts = this.config.hosts;
			else if (this.config.host) {
				esConfig.host = this.config.host;
				esConfig.port = this.config.port;
				esConfig.sniffOnStart = true;
				esConfig.sniffInterval = 30000;
				esConfig.sniffOnConnectionFault = true;
			}

			this.connection = new elasticsearch.Client(esConfig);
		};
		this.connection.ping({
			requestTimeout: Infinity
		}, err => {
			if (err) {
				Services.logger.error(`Failed connecting to Elasticsearch "${this.config.host}": ${err.message}. Retrying...`);
				setTimeout(() => {
					retryConnection();
				}, 1000);
			} else {
				Services.logger.info('Connected to ElasticSearch MainDatabase');
				this.onReadyCallback(this);
			}
		});
	}

	/**
     *
     * @param {FilterBuilder} builder
     * @return {Object} The result of <code>builder.build()</code> but with a few translations for ES
     */
	getQueryObject(builder) {
		let translationMappings = {
			is: 'term',
			not: 'not',
			exists: 'exists',
			range: 'range',
			in_array: 'terms',
			like: 'regexp'
		};

		function Translate(node) {
			node.children.forEach(child => {
				if (child instanceof BuilderNode) {
					Translate(child);
				} else {
					let replaced = Object.keys(child)[0];
					if (translationMappings[replaced]) {
						//'not' contains a filter name
						if (replaced == 'not') {
							let secondReplaced = Object.keys(child[replaced])[0];

							if (translationMappings[secondReplaced] !== secondReplaced) {
								child[replaced][translationMappings[secondReplaced]] = cloneObject(child[replaced][secondReplaced]);
								delete child[replaced][secondReplaced];
							}
						} else if (replaced == 'like') {
							child[translationMappings[replaced]] = cloneObject(child[replaced]);

							let fieldObj = {};
							Object.keys(child[translationMappings[replaced]]).forEach(field => {
								fieldObj[field] = `.*${escapeRegExp(child[translationMappings[replaced]][field])}.*`;
							});
							child[translationMappings[replaced]] = fieldObj;
							delete child[replaced];
						} else if (translationMappings[replaced] !== replaced) {
							child[translationMappings[replaced]] = cloneObject(child[replaced]);
							delete child[replaced];
						}
					}
				}
			});
		}

		Translate(builder.root);

		return builder.build();
	}

	getObjects(ids, callback) {
		ids = ids.map(id => ({
			_id: id
		}), this);

		this.connection.mget({
			index: this.config.index,
			body: {
				docs: ids
			}
		}, (err, results) => {
			if (err) return callback([err]);

			let notFoundErrors = [];
			let objects = [];
			let versions = {};
			async.each(results.docs, (result, c) => {
				if (result.found) {
					objects.push(result._source);
					versions[result._id] = result._version;
				}
				else
					notFoundErrors.push(new TelepatError(TelepatError.errors.ObjectNotFound, [result._type, result._id]));
				c();
			}, () => {
				callback(notFoundErrors, objects, versions);
			});
		});
	}

	searchObjects(options, callback) {
		let reqBody = {
			query: {
				filtered: {
					filter: {}
				}
			}
		};
		let self = this;
		if (options.filters && !options.filters.isEmpty())
			reqBody.query.filtered.filter = this.getQueryObject(options.filters);

		if (options.fields) {
			if (!(options.scanFunction instanceof Function))
				return callback(new TelepatError(TelepatError.errors.ServerFailure, ['searchObjects was provided with fields but no scanFunction']));

			let hitsCollected = 0;

			this.connection.search({
				index: this.config.index,
				type: options.modelName ? options.modelName : '',
				body: reqBody,
				scroll: '10s',
				searchType: 'scan',
				fields: options.fields,
				size: 1024
			}, function getMore(err, response) {
				if (err) return callback(err);

				if (response.hits.total !== hitsCollected) {
					let objects = [];

					hitsCollected += response.hits.hits.length;

					async.each(response.hits.hits, (hit, c) => {
						let obj = {};
						async.forEachOf(hit.fields, (value, f, c1) => {
							obj[f] = value[0];
							c1();
						}, () => {
							objects.push(obj);
							c();
						});
					}, () => {
						if (response.hits.hits.length)
							options.scanFunction(objects);

						self.connection.scroll({
							scrollId: response._scroll_id,
							scroll: '10s'
						}, getMore);
					});
				} else {
					callback();
				}
			});
		} else {

			if (options.sort) {

				reqBody.sort = [];

				let sortFieldName = Object.keys(options.sort)[0];
				//old sort method
				if (typeof options.sort[sortFieldName] == 'string') {
					let sortObject = {};

					sortObject[sortFieldName] = { order: options.sort[sortFieldName], unmapped_type: "long" };
					reqBody.sort = [sortObject];
				} else {
					Object.keys(options.sort).forEach(field => {
						let sortObjectField = {};

						if (!options.sort[field].type) {
							sortObjectField[field] = { order: options.sort[field].order, unmapped_type: "long" };
						} else if (options.sort[field].type == 'geo') {
							sortObjectField._geo_distance = {};
							sortObjectField._geo_distance[field] = { lat: options.sort[field].poi.lat || 0.0, lon: options.sort[field].poi.long || 0.0 };
							sortObjectField._geo_distance.order = options.sort[field].order;
						}

						reqBody.sort.push(sortObjectField);
					});
				}
			}


			this.connection.search({
				index: this.config.index,
				type: options.modelName,
				body: reqBody,
				from: options.offset,
				size: options.limit
			}, (err, results) => {
				if (err) return callback(err);

				let objects = [];

				results.hits.hits.forEach(object => {
					objects.push(object._source);
				});

				callback(null, objects);
			});
		}
	}

	countObjects(options, callback) {
		let reqBody = {
			query: {
				filtered: {
					filter: {}
				}
			}
		};

		if (options.filters && !options.filters.isEmpty())
			reqBody.query.filtered.filter = this.getQueryObject(options.filters);

		if (options.aggregation) {
			reqBody.aggs = { aggregation: options.aggregation };

			this.connection.search({
				index: this.config.index,
				type: options.modelName,
				body: reqBody,
				search_type: 'count',
				queryCache: true
			}, (err, result) => {
				if (err) return callback(err);

				let countResult = { count: result.hits.total };

				countResult.aggregation = result.aggregations.aggregation.value;

				callback(null, countResult);
			});
		} else {
			this.connection.count({
				index: this.config.index,
				type: options.modelName,
				body: reqBody
			}, (err, result) => {
				if (err) return callback(err);

				let countResult = { count: result.count };

				callback(null, countResult);
			});
		}
	}

	createObjects(objects, callback) {
		let bulk = [];
		let builtinDetected = false;
		objects.forEach(obj => {

			let modelName = obj.type;
			if (builtinModels[modelName]) {
				builtinDetected = true;
			}
			if (obj.properties) {
				obj = obj.properties;
			}

			bulk.push({ index: { _type: modelName, _id: obj.id } });
			bulk.push(obj);
		}, this);

		this.connection.bulk({
			index: this.config.index,
			body: bulk,
			refresh: builtinDetected
		}, (err, res) => {
			if (res.errors) {
				res.items.forEach(error => {
					Services.logger.error(`Error creating ${error.index._type}: ${error.index.error}`);
				});
			}
			callback(err, res);
		});
	}

	updateObjects(patches, callback) {
		let ids = {};
		let dbObjects = {};
		let totalErrors = [];
		let builtinDetected = false;
		let self = this;
		patches.forEach(patch => {
			let id = patch.path.split('/')[1];
			if (!ids[id]) {
				ids[id] = [patch];
			} else {
				ids[id].push(patch);
			}
		});

		function getAndUpdate(objectIds, callback2) {
			let dbObjectVersions = {};
			let conflictedObjectIds = {};
			let bulk = [];

			async.series([
				function getObjects(callback1) {
					self.getObjects(Object.keys(objectIds), (err, results, versions) => {
						if (err && err.length == 1) {
							return callback1(err[0]);
						}

						totalErrors = err;
						results.forEach(obj => {
							let object;

							if (obj.properties)
								object = obj.properties;
							else {
								object = obj;
							}
							let type = object.type;

							if (builtinModels[type]) {
								dbObjects[object.id] = new builtinModels[type](object);
							} else if (type !== 'user_metadata') {
								dbObjects[object.id] = new Model(object);
							} else {
								dbObjects[object.id] = object;
							}
							dbObjectVersions[object.id] = versions[object.id];
						});
						callback1();
					});
				},
				function updateBulk(callback1) {
					async.forEachOf(objectIds, (patch, id, c) => {
						let objectModel = null;

						objectModel = patch[0].path.split('/')[0];

						if (builtinModels[objectModel]) {
							builtinDetected = true;
						}

						if (dbObjects[id].properties) {
							dbObjects[id] = dbObjects[id].properties;
						}

						dbObjects[id] = Delta.processObject(patch, dbObjects[id]);


						let script = `def jsonSlurper = new groovy.json.JsonSlurper();def parsed = jsonSlurper.parseText('${JSON.stringify(dbObjects[id]).replace(/'/g, "\\'").replace(/"/g, "\\\"")}');ctx._source = parsed;`;

						bulk.push({ update: { _type: objectModel, _id: id, _version: dbObjectVersions[id] } });
						bulk.push({ script });

						c();
					}, () => {
						self.connection.bulk({
							index: self.config.index,
							body: bulk,
							refresh: builtinDetected
						}, (err, res) => {
							if (err) {
								return callback1(err);
							}

							if (res.errors) {
								res.items.forEach(error => {
									if (error.update.status === 409) {
										conflictedObjectIds[error.update._id] = ids[error.update._id];
									}
									else {
										totalErrors.push(new Error(`Failed to update ${error.update._type} with ID ${error.update._id}: ${error.update.error}`));
									}
								});
							}

							callback1();
						});
					});
				}
			], err => {
				if (err) {
					return callback2(err);
				}

				if (Object.keys(conflictedObjectIds).length) {
					return getAndUpdate(conflictedObjectIds, callback2);
				}
				callback2();
			});
		}

		getAndUpdate(ids, err => {
			if (err) {
				callback([err]);
			}
			else {
				callback(totalErrors, dbObjects);
			}
		});
	}

	deleteObjects(ids, callback) {
		let self = this;
		let bulk = [];
		let builtinDetected = false;

		async.each(Object.keys(ids), (id, c) => {
			if (builtinModels[ids[id]])
				builtinDetected = true;

			bulk.push({ delete: { _type: ids[id], _id: id } });
			c();
		}, () => {
			self.connection.bulk({
				index: self.config.index,
				body: bulk,
				refresh: builtinDetected
			}, (err, results) => {
				if (err) return callback([err]);
				let notFoundErrors = [];

				async.each(results.docs, (result, c) => {
					if (!result.found)
						notFoundErrors.push(new TelepatError(TelepatError.errors.ObjectNotFound, [result._type, result._id]));
					c();
				}, () => {
					callback(notFoundErrors.length ? notFoundErrors : null);
				});
			});
		});
	}
}

function escapeRegExp(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}



module.exports = ElasticSearchDB;
