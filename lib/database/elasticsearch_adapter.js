var Main_Database_Adapter = require('./main_database_adapter');
var Application = require('../Application');
var elasticsearch = require('elasticsearch');
var guid = require('uuid');
var async = require('async');
var utils = require('../../utils/utils');
var Delta = require('../Delta');
var TelepatError = require('../TelepatError');
var AgentKeepAlive = require('agentkeepalive');
var cloneObject = require('clone');
var FilterBuilder = require('../../utils/filterbuilder').FilterBuilder;
var BuilderNode = require('../../utils/filterbuilder').BuilderNode;

require('colors');

var ElasticSearchDB = function(config) {
	var self = this;
	config = config || {};

	var envVariables = {
		TP_ES_HOST: process.env.TP_ES_HOST,
		TP_ES_HOSTS: process.env.TP_ES_HOSTS,
		TP_ES_INDEX: process.env.TP_ES_INDEX
	};
	var validEnvVariables = true;

	if (!envVariables.TP_ES_HOST && !envVariables.TP_ES_HOSTS) {
		Application.logger.notice('Missing environment variable "TP_ES_HOST" or "TP_ES_HOSTS". Trying configuration file.');

		if (!Object.getOwnPropertyNames(config).length) {
			Application.logger.emergency('Configuration file is missing configuration for ElasticSearch database ' +
				'adapter.');
			process.exit(1);
		}

		validEnvVariables = false;
	}

	if (validEnvVariables) {
		this.config = {
			hosts: process.env.TP_ES_HOSTS,
			host: process.env.TP_ES_HOST,
			index: process.env.TP_ES_INDEX,
			subscribe_limit: process.env.TP_ES_SUBSCRIBE_LIMIT,
			get_limit: process.env.TP_ES_GET_LIMIT
		};
	} else {
		this.config = config;
	}

	this.config.subscribe_limit = this.config.subscribe_limit ? this.config.subscribe_limit : 64;
	this.config.get_limit = this.config.get_limit ? this.config.get_limit : 384;

	var esConfig = {
		apiVersion: '1.7',
		keepAlive: true,
		maxSockets: 300,
		createNodeAgent: function(connection, config) {
			return new AgentKeepAlive(connection.makeAgentConfig(config));
		}
	};

	if (this.config.hosts) {
		if (validEnvVariables)
			esConfig.hosts = this.config.hosts.split(',');
		else
			esConfig.hosts = this.config.hosts;
	}
	else if (this.config.host) {
		esConfig.host = this.config.host;
		esConfig.port = this.config.port;
		esConfig.sniffOnStart = true;
		esConfig.sniffInterval = 30000;
		esConfig.sniffOnConnectionFault = true;
	}

	Main_Database_Adapter.call(this, new elasticsearch.Client(esConfig));

	var retryConnection = (function() {
		//we had to copy paste the config variable because the es sdk doesn't allow to reuse the config object
		var esConfig = {
			apiVersion: '1.7',
			keepAlive: true,
			maxSockets: 300,
			createNodeAgent: function(connection, config) {
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
	}).bind(this);

	this.connection.ping({
		requestTimeout: Infinity
	}, function(err) {
		if (err) {
			var d = new Date();
			Application.logger.error('Failed connecting to Elasticsearch "'+self.config.host+'": '
				+err.message+'. Retrying...');
			setTimeout(function () {
				retryConnection();
			}, 1000);
		} else {
			Application.logger.info('Connected to ElasticSearch MainDatabase');
			self.onReadyCallback(self);
		}
	});
};

ElasticSearchDB.prototype = Object.create(Main_Database_Adapter.prototype);

/**
 *
 * @param {FilterBuilder} builder
 * @return {Object} The result of <code>builder.build()</code> but with a few translations for ES
 */
ElasticSearchDB.prototype.getQueryObject = function(builder) {
	var translationMappings = {
		is: 'term',
		not: 'not',
		exists: 'exists',
		range: 'range',
		in_array: 'terms'
	}

	function Translate(node) {
		node.children.forEach(function(child) {
			if (child instanceof BuilderNode) {
				Translate(child);
			} else {
				var replaced = Object.keys(child)[0];
				if (translationMappings[replaced]) {
					//'not' contains a filter name
					if (replaced == 'not') {
						var secondReplaced = Object.keys(child[replaced])[0];
						child[replaced][translationMappings[secondReplaced]] = cloneObject(child[replaced][secondReplaced]);
						delete child[replaced][secondReplaced];
					}

					child[translationMappings[replaced]] = cloneObject(child[replaced]);
					delete child[replaced];
				}
			}
		});
	};

	Translate(builder.root);

	return builder.build();
};

ElasticSearchDB.prototype.getObjects = function(ids, callback) {
	ids = ids.map(function(id) {
		return {_id: id};
	}, this);

	this.connection.mget({
		index: this.config.index,
		body: {
			docs: ids
		}
	}, function(err, results) {
		if (err) return callback([err]);

		var notFoundErrors = [];
		var objects = [];

		async.each(results.docs, function(result, c) {
			if (result.found)
				objects.push(result._source);
			else
				notFoundErrors.push(new TelepatError(TelepatError.errors.ObjectNotFound, [result._type, result._id]));
			c();
		}, function() {
			callback(notFoundErrors, objects);
		});
	});
};

ElasticSearchDB.prototype.searchObjects = function(options, callback) {
	var reqBody = {
		query: {
			filtered: {
				filter: {}
			}
		}
	};
	var self = this;

	if (options.filters && !options.filters.isEmpty())
		reqBody.query.filtered.filter = this.getQueryObject(options.filters);

	if (options.fields) {
		if (!(options.scanFunction instanceof Function))
			return callback(new TelepatError(TelepatError.errors.ServerFailure, ['searchObjects was provided with fields but no scanFunction']));

		var hitsCollected = 0;

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
				var objects = [];

				hitsCollected += response.hits.hits.length;

				async.each(response.hits.hits, function(hit, c) {
					var obj = {};
					async.forEachOf(hit.fields, function(value, f, c1) {
						obj[f] = value[0];
						c1();
					}, function() {
						objects.push(obj);
						c();
					});
				}, function() {
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
		if (sort) {
			reqBody.sort = {};

			if (!sort.type) {
				reqBody.sort = [sort];
			} else if (sort.type == 'default') {
				reqBody.sort[sort.field] = sort.order;
			} else if (sort.type == 'geo') {
				reqBody.sort._geo_distance = {};
				reqBody.sort._geo_distance[sort.field] = {lat: sort.poi.lat || 0.0, lon: sort.poi.long || 0.0};
				reqBody.sort._geo_distance.order = sort.order;
			}
		}

		this.connection.search({
			index: this.config.index,
			type: options.modelName,
			body: reqBody,
			from: options.offset,
			size: options.limit,
			search_type: options.sort
		}, function(err, results) {
			if (err) return callback(err);

			var objects = [];

			results.hits.hits.forEach(function(object) {
				objects.push(object._source);
			})

			callback(null, objects);
		});
	}
};

ElasticSearchDB.prototype.countObjects = function(options, callback) {
	var reqBody = {
		query: {
			filtered: {
				filter: {}
			}
		}
	};

	if (options.filters && !options.filters.isEmpty())
		reqBody.query.filtered.filter = this.getQueryObject(options.filters);

	if (options.aggregation) {
		reqBody.aggs = {aggregation: options.aggregation};

		this.connection.search({
			index: this.config.index,
			type: options.modelName,
			body: reqBody,
			search_type: 'count',
			queryCache: true
		}, function(err, results) {
			if (err) return callback(err);

			var countResult = {count: result.hits.total};

			countResult.aggregation = result.aggregations.aggregation.value;

			callback(null, countResult);
		});
	} else {
		this.connection.count({
			index: this.config.index,
			type: options.modelName,
			body: reqBody
		}, function(err, result) {
			if (err) return callback(err);

			var countResult = {count: result.count};

			callback(null, countResult);
		});
	}
};

ElasticSearchDB.prototype.createObjects = function(objects, callback) {
	var bulk = [];
	var builtinModels = ['application', 'admin', 'user', 'user_metadata', 'context'];
	var builtinDetected = false;

	objects.forEach(function(obj) {
		var modelName = obj.type;
		if (builtinModels.indexOf(modelName) !== -1)
			builtinDetected = true;

		bulk.push({index: {_type: modelName, _id: obj.id}});
		bulk.push(obj);
	}, this);

	this.connection.bulk({
		index: this.config.index,
		body: bulk,
		refresh: builtinDetected
	}, callback);
};

ElasticSearchDB.prototype.updateObjects = function(patches, callback) {
	var ids = {};
	var dbObjects = {};
	var processedObjects = [];
	var totalErrors = [];
	var bulk = [];
	var builtinModels = ['application', 'admin', 'user', 'user_metadata', 'context'];
	var builtinDetected = false;
	var self = this;

	patches.forEach(function(patch) {
		var id = patch.path.split('/')[1];
		if (!ids[id])
			ids[id] = [patch];
		else
			ids[id].push(patch);
	});

	async.series([
		function getObjects(callback1) {
			self.getObjects(Object.keys(ids), function(err, results) {
				if (err && err.length == 1) return callback1(err[0]);

				totalErrors = err;
				results.forEach(function(object) {
					dbObjects[object.id] = object;
				});
				callback1();
			});
		},
		function updateBulk(callback1) {
			async.forEachOf(ids, function(patches, id, c) {
				var objectModel = null;

				objectModel = patches[0].path.split('/')[0];

				if (builtinModels.indexOf(objectModel) !== -1)
					builtinDetected = true;

				dbObjects[id] = Delta.processObject(patches, dbObjects[id]);

				var script = 'def jsonSlurper = new groovy.json.JsonSlurper();'+
					'def parsed = jsonSlurper.parseText(\''+JSON.stringify(dbObjects[id])+'\');'+
					'ctx._source = parsed;';

				bulk.push({update: {_type: objectModel, _id: id}});
				bulk.push({script: script});
				c();
			}, function() {
				self.connection.bulk({
					index: self.config.index,
					body: bulk,
					refresh: builtinDetected
				}, function(err, res) {
					if (res.errors)
						res.items.forEach(function(error) {
							totalErrors.push(new Error('Failed to update '+error.update._type+' with ID '+error.update._id+': '+error.update.error));
						});

					callback1();
				});
			});
		}
	], function(err) {
		if (err)
			callback([err]);
		else
			callback(totalErrors, dbObjects);
	});
};

ElasticSearchDB.prototype.deleteObjects = function(ids, callback) {
	var self = this;
	var bulk = [];
	var builtinModels = ['application', 'admin', 'user', 'user_metadata', 'context'];
	var builtinDetected = false;

	async.each(Object.keys(ids), function(id, c) {
		if (builtinModels.indexOf(ids[id]) !== -1)
			builtinDetected = true;

		bulk.push({delete: {_type: ids[id], _id: id}});
		c();
	}, function(err) {
		self.connection.bulk({
			index: self.config.index,
			body: bulk,
			refresh: builtinDetected
		}, function(err, results) {
			if (err) return callback([err]);
			var notFoundErrors = [];

			async.each(results.docs, function(result, c) {
				if (!result.found)
					notFoundErrors.push(new TelepatError(TelepatError.errors.ObjectNotFound, [result._type, result._id]));
				c();
			}, function() {
				callback(notFoundErrors.length ? notFoundErrors : null);
			});
		});
	});
};

module.exports = ElasticSearchDB;
