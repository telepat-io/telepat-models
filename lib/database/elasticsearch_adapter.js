var Main_Database_Adapter = require('./main_database_adapter');
var Application = require('../Application');
var elasticsearch = require('elasticsearch');
var guid = require('uuid');
var async = require('async');
var utils = require('../../utils/utils');
var Delta = require('../Delta');
var TelepatError = require('../TelepatError');
require('colors');

var ElasticSearchDB = function(config) {
	var self = this;
	config = config || {};

	var envVariables = {
		TP_ES_HOST: process.env.TP_ES_HOST,
		TP_ES_PORT: process.env.TP_ES_PORT,
		TP_ES_INDEX: process.env.TP_ES_INDEX
	};
	var validEnvVariables = true;

	for(var varName in envVariables) {
		if (envVariables[varName] === undefined) {
			console.log('Missing'.yellow+' environment variable "'+varName+'". Trying configuration file.');

			if (!Object.getOwnPropertyNames(config).length) {
				throw new Error('Configuration file is missing configuration for ElasticSearch database adapter.');
			}

			validEnvVariables = false;
			break;
		}
	}

	if (validEnvVariables) {
		this.config = {
			host: process.env.TP_ES_HOST,
			port: process.env.TP_ES_PORT,
			index: process.env.TP_ES_INDEX,
			subscribe_limit: process.env.TP_ES_SUBSCRIBE_LIMIT,
			get_limit: process.env.TP_ES_GET_LIMIT
		};
	} else {
		this.config = config;
	}

	this.config.subscribe_limit = this.config.subscribe_limit ? this.config.subscribe_limit : 64;
	this.config.get_limit = this.config.get_limit ? this.config.get_limit : 384;

	Main_Database_Adapter.call(this, new elasticsearch.Client({host: this.config.host+':'+this.config.port}));

	var retryConnection = (function() {
		this.connection = new elasticsearch.Client({host: this.config.host+':'+this.config.port});
	}).bind(this);

	this.connection.ping({
		requestTimeout: Infinity
	}, function(err) {
		if (err) {
			var d = new Date();
			console.log('Failed'.bold.red+' connecting to Elasticsearch "'+self.config.host+'": '+err.message);
			console.log('Retrying...');
			setTimeout(function () {
				retryConnection();
			}, 1000);
		} else {
			console.log('Connected'.green+' to ElasticSearch MainDatabase');
			self.onReadyCallback(self);
		}
	});
};

ElasticSearchDB.prototype = Object.create(Main_Database_Adapter.prototype);

ElasticSearchDB.prototype.applicationGet = function(id, callback) {
	this.connection.get({
		index: this.config.index,
		type: 'application',
		id: id
	}, function(error, response) {
		if (error) return callback(error);

		callback(null, response._source);
	});
};

ElasticSearchDB.prototype.applicationGetAll = function(callback) {
	this.connection.search({
		index: this.config.index,
		size: this.config.get_limit,
		type: 'application',
		fields: ['_source']
	}, function(error, response) {
		if (error) return callback(error);

		var hits = [];

		response.hits.hits.forEach(function(dbItem) {
			hits.push(dbItem._source);
		});

		callback(null, hits);
	});
};

ElasticSearchDB.prototype.applicationCount = function(callback) {
	this.connection.count({
		index: this.config.index,
		type: 'application'
	}, function(error, results) {
		if (error) return callback(error);

		callback(null, results.count);
	});
};

ElasticSearchDB.prototype.applicationCreate = function(props, callback) {
	props.id = guid.v4();
	props.keys = props.keys || [];
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;
	this.connection.create({
		index: this.config.index,
		type: 'application',
		id: props.id,
		body: props,
		refresh: true
	}, function(err, result) {
		if (err) return callback(err);

		callback(null, props);
	});
};

ElasticSearchDB.prototype.applicationUpdate = function(id, patches, callback) {
	var self = this;

	async.waterfall([
		function(callback1) {
			self.applicationGet(id, callback1);
		},
		function(application, callback1) {
			application = Delta.processObject(patches, application);

			self.connection.update({
				index: self.config.index,
				type: 'application',
				id: id,
				body: {
					doc: application
				}
			}, function(err) {
				if (err) return callback1(err);

				callback1(null, application);
			});
		}
	], function(err, application) {
		if (err) return callback(err);
		callback(null, application);
	});
};

ElasticSearchDB.prototype.applicationDelete = function(id, callback) {
	var self = this;

	async.series([
		function(callback1) {
			self.connection.deleteByQuery({
				index: self.config.index,
				body: {
					query: {
						term: {application_id: id}
					}
				}
			}, function(err, res) {
				if (err) return callback1(err);
				callback1();
			});
		},
		function(callback1) {
			self.connection.delete({
				index: self.config.index,
				type: 'application',
				id: id,
				refresh: true
			}, function(err, res) {
				if (err) return callback1(err);
				callback1(err);
			})
		}
	], callback);
};

ElasticSearchDB.prototype.applicationGetSchema = function(appId, callback) {
	this.connection.get({
		index: this.config.index,
		type: 'application',
		id: appId
	}, function(err, results) {
		if (err) return callback(err);

		callback(null, results._source.schema ? results._source.schema : {});
	});
};

ElasticSearchDB.prototype.applicationUpdateSchema = function(appId, schema, callback) {
	var self = this;
	async.series([
		function(callback1) {
			self.connection.update({
				index: self.config.index,
				type: 'application',
				id: appId,
				body: {
					doc: {
						schema: schema
					}
				}
			}, callback1);
		},
		function(callback1) {
			self.applicationGetSchema(appId, callback1);
		}
	], function(err, results) {
		callback(err, results[1]);
	});
};

ElasticSearchDB.prototype.applicationDeleteModelSchema = function(appId, modelName, callback) {
	var self = this;

	async.series([
		function(callback1) {
			self.connection.update({
				index: self.config.index,
				type: 'application',
				id: appId,
				script: 'ctx._source.schema.remove("'+modelName+'")'
			}, callback1);
		},
		function(callback1) {
			self.connection.deleteByQuery({
				index: self.config.index,
				q: 'type:'+modelName
			}, callback1);
		}
	], callback);
};

ElasticSearchDB.prototype.applicationHasContext = function(appId, contextId, callback) {
	this.connection.get({
		index: this.config.index,
		type: 'context',
		id: contextId
	}, function(err, result) {
		if (err)
			return callback(err);
		else if (!result.found)
			return callback(null, false);

		if (result._source.application_id == appId) {
			callback(null, true);
		} else
			callback(null, false);
	});
};

ElasticSearchDB.prototype.adminGet = function(admin, callback) {
	if (admin.id) {
		this.connection.get({
			index: this.config.index,
			type: 'admin',
			id: admin.id
		}, function(err, result) {
			if (err) return callback(err);

			if (!result.found) {
				return callback(new TelepatError(TelepatError.errors.AdminNotFound, ['with ID '+admin.id]));
			}

			callback(null, result._source);
		});
	} else if (admin.email) {
		this.connection.search({
			index: this.config.index,
			type: 'admin',
			q: 'email:"'+admin.email+'"'
		}, function(err, result) {
			if (err) return callback(err);

			if (result.hits.total == 0) {
				return callback(new TelepatError(TelepatError.errors.AdminNotFound, ['with email address '+admin.email]));
			}

			callback(null, result.hits.hits[0]._source);
		});
	} else {
		callback(new Error('Admin.get: no id or email supplied'));
	}
};

ElasticSearchDB.prototype.adminCreate = function(email, props, callback) {
	var self = this;

	props.email = email;
	props.id = guid.v4();
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;

	async.series([
		function(callback1) {
			self.adminGet({email: email}, function(err, admin) {
				if (err && err.status == 404)
					return callback1();
				else if (err)
					return callback1(err);
				else {
					callback1(new TelepatError(TelepatError.errors.AdminAlreadyExists));
				}
			});
		},
		function(callback1) {
			self.connection.create({
				index: self.config.index,
				type: 'admin',
				id: props.id,
				body: props,
				refresh: true
			}, function(err, result) {
				if (err) return callback(err);

				callback1(null, props);
			});
		}
	], callback);
};

ElasticSearchDB.prototype.adminUpdate = function(patches, callback) {
	var self = this;
	var updatedAdmin = null;
	var adminId = patches[0].path.split('/')[1];

	async.waterfall([
		function(callback1) {
			self.adminGet({id: adminId}, callback1);
		},
		function(admin, callback1) {
			updatedAdmin = Delta.processObject(patches, admin);

			self.connection.update({
				index: self.config.index,
				type: 'admin',
				id: adminId,
				body: {
					doc: updatedAdmin
				}
			}, callback1);
		}
	], function(err) {
		if (err && err.status == 404) {
			return callback(new TelepatError(TelepatError.errors.AdminNotFound, ['with ID '+adminId]));
		} else if (err)
			callback(err);
		else
			callback(null, updatedAdmin);
	});
};

ElasticSearchDB.prototype.adminDelete = function(admin, callback) {
	var self = this;
	var adminObject = null;
	var adminApplications = [];

	async.series([
		function(callback1) {
			self.adminGet(admin, function(err, response) {
				if (err) return callback1(err);

				adminObject = response;
				callback1();
			});
		},
		function(callback1) {
			self.connection.search({
				index: self.config.index,
				type: 'application',
				size: self.config.get_limit,
				body: {
					query: {
						term: {
							admins: adminObject.id
						}
					}
				},
				_source: false
			}, function(err, response) {
				if (err) return callback1(err);

				response.hits.hits.forEach(function(item) {
					adminApplications.push(item._id);
				})
				callback1();
			});
		},
		function(callback1) {
			var bulkOps = [];

			adminApplications.forEach(function(appId) {
				bulkOps.push({update: {_index: self.config.index, _type: 'application', _id: appId}});
				bulkOps.push({script: "ctx._source.admins.remove(adminId)",
					params: {adminId: adminObject.id}
				});
			});

			if (!bulkOps.length) {
				return callback1();
			}

			self.connection.bulk({
				body: bulkOps
			}, callback1);
		},
		function(callback1) {
			self.connection.delete({
				index: self.config.index,
				type: 'admin',
				id: adminObject.id,
				refresh: true
			}, callback1);
		}
	], callback);
}

ElasticSearchDB.prototype.contextGet = function(id, callback) {
	this.connection.get({
		index: this.config.index,
		type: 'context',
		id: id,
		fields: ['_source']
	}, function(err, result) {
		if (err) return callback(err);

		callback(null, result._source);
	});
};

ElasticSearchDB.prototype.contextGetAll = function(appId, callback) {
	var searchQuery = {
		index: this.config.index,
		type: 'context',
		size: this.config.get_limit
	};

	if (typeof appId == 'number' || typeof appId == 'string')
		searchQuery.q = 'application_id:'+appId;
	else
		callback = appId;

	this.connection.search(searchQuery, function(err, results) {
		if (err) return callback(err);

		var contextObjects = [];

		results.hits.hits.forEach(function(context) {
			contextObjects.push(context._source);
		});

		callback(null, contextObjects);
	});
};

ElasticSearchDB.prototype.contextCount = function(callback) {
	this.connection.count({
		index: this.config.index,
		type: 'context'
	}, function(err, results) {
		if (err) return callback(err);

		callback(null, results.count);
	});
};

ElasticSearchDB.prototype.contextCreate = function(props, callback) {
	props.id = guid.v4();
	props.state = 0;
	props.meta = props.meta || {};
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;

	this.connection.create({
		index: this.config.index,
		type: 'context',
		id: props.id,
		body: props,
		refresh: true
	}, function(err, res) {
		if (err) return callback(err);

		callback(null, props);
	});
};

ElasticSearchDB.prototype.contextUpdate = function(id, patches, callback) {
	var self = this;
	var updatedContext = null;

	async.waterfall([
		function(callback1) {
			self.contextGet(id, callback1);
		},
		function(context, callback1) {
			updatedContext = Delta.processObject(patches, context);

			self.connection.update({
				index: self.config.index,
				type: 'context',
				id: id,
				body: {
					doc: updatedContext
				}
			}, callback1);
		}
	], function(err) {
		if (err) return callback(err);

		callback(null, updatedContext);
	});
};

ElasticSearchDB.prototype.contextDelete = function(id, callback) {
	var contextObjects = [];
	var self = this;

	async.waterfall([
		function(callback1) {
			self.connection.search({
				index: self.config.index,
				q: 'context_id:"'+id+'"'
			}, function(err, results) {
				if (err) return callback1(err);

				results.hits.hits.forEach(function(object) {
					contextObjects.push(object._source);
				});

				callback1();
			});
		},
		function(callback1) {
			self.connection.delete({
				index: self.config.index,
				type: 'context',
				id: id,
				refresh: true
			}, function(err) {
				callback1(err);
			});
		},
		//gets subscription documents that have that context ID in the key
		function(callback1) {
			Application.redisClient.scan([0, 'MATCH', 'blg:'+id+':*', 'COUNT', 100000], function(err, results) {
				callback1(err, results[1]);
			});
		},
		function(subscriptionKeys, callback1) {
			if (!subscriptionKeys.length)
				return callback1(null, {});
			Application.redisClient.mget(subscriptionKeys, function (err, results) {
				if (err) return callback1(err);

				var subscriptionDevices = {};
				var i = 0;
				async.each(results, function (deviceKey, c) {
					if (deviceKey) {
						if (!subscriptionDevices[deviceKey])
							subscriptionDevices[deviceKey] = [subscriptionKeys[i]];
						else
							subscriptionDevices[deviceKey].push(subscriptionKeys[i]);
					}
					i++;
					c();
				}, function() {
					callback1(null, subscriptionDevices);
				});
			});
		},
		function(subscriptionDevices, callback1) {
			if (Object.getOwnPropertyNames(subscriptionDevices).length === 0)
				return callback1();

			async.each(Object.keys(subscriptionDevices), function(deviceKey, c) {
				Application.redisClient.get(deviceKey, function(err, deviceString) {
					if (err) return c(err);
					var deviceModified = false;
					var deviceObject = JSON.parse(deviceString);

					async.each(subscriptionDevices[deviceKey], function(subscriptionKey, c2) {
						if (deviceObject.subscriptions) {
							var idx = deviceObject.subscriptions.indexOf(subscriptionKey);

							if (idx !== -1) {
								deviceObject.subscriptions.splice(idx, 1);
								deviceModified = true;
							}
						}
						c2();
					});

					if (deviceModified)
						Application.redisClient.set([deviceKey, JSON.stringify(deviceObject)], function(){});

					c();
				})
			}, callback1);
		}
	], function(err) {
		if (err) return callback(err);

		callback(null, contextObjects);
	});
};

ElasticSearchDB.prototype.modelGet = function(name, appId, context_id, id, callback) {
	this.connection.get({
		index: this.config.index,
		type: name,
		id: id
	}, function(err, response) {
		if (err && err.status == 404)
			return callback(new TelepatError(TelepatError.errors.ObjectNotFound, [name, id]));
		else if (err)
			return callback(err);

		callback(null, response._source);
	});
};

ElasticSearchDB.prototype.modelMultiGet = function(modelName, ids, appId, context, callback) {
	this.connection.search({
		index: this.config.index,
		type: modelName,
		size: this.config.get_limit,
		body: {
			query: {
				ids: {values: ids}
			}
		}
	}, function(err, response) {
		if (err) return callback(err);
		var objects = [];

		response.hits.hits.forEach(function(object) {
			objects.push(object._source);
		});

		callback(null, objects);
	})
};

ElasticSearchDB.prototype.modelGetAll = function(modelName, appId, context, callback) {
	this.connection.search({
		index: this.config.index,
		type: modelName,
		size: this.config.get_limit,
		body: {
			query: {
				bool: {
					must: [
						{term: {application_id: appId}},
						{term: {context_id: context}}
					]
				}
			}
		}
	}, function(err, response) {
		if (err) return callback(err);

		var objects = [];

		response.hits.hits.forEach(function(object) {
			objects.push(object._source);
		});

		callback(null, objects);
	});
};

ElasticSearchDB.prototype.modelDelete = function(modelName, appId, context, id, onlyChild, callback) {
	var self = this;
	var applicationObject = null;

	async.series([
		function(callback1) {
			Application(appId, function(err, app) {
				if (err) return callback1(err);
				applicationObject = app;
				callback1();
			});
		},
		function(callback1) {
			self.connection.delete({
				index: self.config.index,
				type: modelName,
				id: id
			}, function(err, response) {
				if (!response || !response.found) {
					return callback1(new TelepatError(TelepatError.errors.ObjectNotFound, [modelName, id]));
				} else
					callback1();
			});
		},
		function(callback1) {
			if (onlyChild)
				return callback1();

			var children = applicationObject.schema[modelName].hasMany || [];

			if (applicationObject.schema[modelName].hasSome)
				children = children.concat(applicationObject.schema[modelName].hasSome) || [];

			if (!children.length)
				return callback1();

			async.each(children, function(child, c) {
				var parentIdProperty = modelName+'_id';
				var parentIdPropertyTerm = {term: {}};
				parentIdPropertyTerm.term[parentIdProperty] = id;

				var searchParams = {
					index: self.config.index,
					type: child,
					body: {
						query: {
							bool: {
								must: [
									{term: {context_id: context}},
									{term: {application_id: appId}}
								]
							}
						}
					},
					size: self.config.get_limit
				};

				searchParams.body.query.bool.must.push(parentIdPropertyTerm);

				self.connection.search(searchParams, function(err, results) {
					if (err) return c(err);

					async.each(results.hits.hits, function(item, c2) {
						self.modelDelete(item._source.type, appId, context, item._source.id, false, function(err2) {
							if (err2 && err2.status == '404')
								console.log(err2);
							c2();
						});
					}, c);
				});
			}, callback1);
		}
	], callback);
};

ElasticSearchDB.prototype.modelCount = function(modelName, appId, callback) {
	this.connection.count({
		index: this.config.index,
		type: modelName,
		body: {
			query: {
				bool: {
					must: [
						{term: {application_id: appId}}
					]
				}
			}
		}
	}, function(err, result) {
		if (err) return callback(err);

		callback(null, result.count);
	});
};

ElasticSearchDB.prototype.modelCountByChannel = function(channel, callback) {
	var userQuery = {};
	var parentQuery = {};
	var elasticSearchQuery = {
		query: {
			bool: {
				must: [
					{term: {application_id: channel.appId}},
					{term: {context_id: channel.props.context}}
				]
			}
		}
	};

	if (channel.props.user) {
		userQuery['user_id'] = channel.props.user;
		elasticSearchQuery.query.bool.must.push({term: userQuery});
	}

	if(channel.props.parent) {
		parentQuery[channel.props.parent.model+'_id'] = channel.props.parent.id;
		elasticSearchQuery.query.bool.must.push({term: parentQuery});
	}

	if (channel.filter)
		elasticSearchQuery.filter = utils.parseQueryObject(channel.filter);

	this.connection.count({
		index: this.config.index,
		type: channel.props.model,
		body: elasticSearchQuery
	}, function(err, result) {
		if (err) return callback(err);

		callback(null, result.count);
	});
}

ElasticSearchDB.prototype.modelCreate = function(modelName, appId, props, callback) {
	var id = guid.v4();
	var parent = null;
	var self = this;
	props.id = id;

	var relationType = null;
	var parentRelationKey = null;
	var appModels = Application.loadedAppModels[appId].schema;

	props.application_id = appId;
	props.created = Math.floor((new Date()).getTime()/1000);
	props.modified = props.created;
	props.type = modelName;

	async.series([
		function(callback1) {
			for (var r in appModels[modelName].belongsTo) {
				if (props[appModels[modelName].belongsTo[r].parentModel + '_id']) {
					parent = {
						model: appModels[modelName].belongsTo[r].parentModel,
						id: props[appModels[modelName].belongsTo[r].parentModel + '_id']
					};
					relationType = appModels[modelName].belongsTo[r].relationType;
				}
			}

			if (relationType == 'hasSome') {
				parentRelationKey = props[appModels[parent.model].hasSome_property+'_index'];
			}

			if (parent) {
				self.modelGet(parent.model, appId, props.context_id, parent.id, function(err, result) {
					if (err && err.status == 404) {
						callback1(new TelepatError(TelepatError.errors.ParentObjectNotFound, [parent.model, parent.id]));
					} else if (err) {
						return callback1(err);
					} else if (result[appModels[parent.model].hasSome_property] &&
						result[appModels[parent.model].hasSome_property].length <= parentRelationKey) {

						callback1(new TelepatError(TelepatError.errors.InvalidObjectRelationKey,
							[
								parentRelationKey,
								result[appModels[parent.model].hasSome_property].length-1
							]));
					} else
						callback1();
				});
			} else
				callback1();
		},
		function(callback1) {
			self.connection.create({
				index: self.config.index,
				type: modelName,
				id: id,
				body: props
			}, callback1)
		}
	], function(err) {
		if (err) return callback(err);

		callback(null, props);
	});
};

ElasticSearchDB.prototype.modelUpdate = function(modelName, appId, context, id, patch, callback) {
	var self = this;

	async.waterfall([
		function(callback1) {
			self.modelGet(modelName, appId, context, id, callback1);
		},
		function(object, callback1) {
			object = Delta.processObject(patch, object);

			self.connection.update({
				index: self.config.index,
				type: modelName,
				id: id,
				body: {
					doc: object
				}
			}, callback1);
		}
	], callback);
};

/**
 *
 * @param {Channel} channel
 * @param callback
 */
ElasticSearchDB.prototype.modelSearch = function(channel, page, callback) {
	var userQuery = {};
	var parentQuery = {};
	var elasticSearchQuery = {
		query: {
			bool: {
				must: [
					{term: {application_id: channel.appId}},
					{term: {context_id: channel.props.context}}
				]
			}
		}
	};

	if (channel.filter)
		elasticSearchQuery.filter = utils.parseQueryObject(channel.filter);

	if (channel.props.user) {
		userQuery['user_id'] = channel.props.user;
		elasticSearchQuery.query.bool.must.push({term: userQuery});
	}

	if(channel.props.parent) {
		parentQuery[channel.props.parent.model+'_id'] = channel.props.parent.id;
		elasticSearchQuery.query.bool.must.push({term: parentQuery});
	}

	this.connection.search({
		index: this.config.index,
		type: channel.props.model,
		body: elasticSearchQuery,
		from: this.config.subscribe_limit*(page-1),
		size: this.config.subscribe_limit
	}, function(err, results) {
		if (err) return callback(err);

		var objects = [];

		results.hits.hits.forEach(function(object) {
			objects.push(object._source);
		})

		callback(null, objects);
	});
}

ElasticSearchDB.prototype.userGet = function(user, appId, callback) {
	if (user.id) {
		this.connection.get({
			index: this.config.index,
			type: 'user',
			id: user.id
		}, function(err, response) {
			if (err) return callback(err);

			if (!response.found) {
				return callback(new TelepatError(TelepatError.errors.UserNotFound));
			}

			callback(null, response._source);
		});
	} else if (user.email) {
		this.connection.search({
			index: this.config.index,
			type: 'user',
			body: {
				query: {
					bool: {
						must: [
							{term: {email: user.email}},
							{term: {application_id: appId}}
						]
					}
				}
			},
			size: 1
		}, function(err, response) {
			if (err) return callback(err);

			if (response.hits.total == 0) {
				return callback(new TelepatError(TelepatError.errors.UserNotFound));
			}

			callback(null, response.hits.hits[0]._source);
		});
	} else {
		callback(new Error('User.get: no id or email supplied'));
	};
};

ElasticSearchDB.prototype.userGetAll = function(appId, page, callback) {
	this.connection.search({
		index: this.config.index,
		type: 'user',
		body: {
			query: {
				bool: {
					must: [
						{term: {application_id: appId}}
					]
				}
			}
		},
		from: this.config.get_limit*(page-1),
		size: this.config.get_limit
	}, function(err, response) {
		if (err) return callback(err);

		var users = [];

		response.hits.hits.forEach(function(user) {
			users.push(user._source);
		});

		callback(null, users);
	});
};

ElasticSearchDB.prototype.userCreate = function(props, appId, callback) {
	var self = this;

	props.id = guid.v4();
	props.application_id = appId;

	if (!props.hasOwnProperty('friends'))
		props.friends = [];

	if (!props.hasOwnProperty('devices'))
		props.devices = [];

	this.userGet({email: props.email}, appId, function(err, result) {
		if (err && err.status == 404) {
			self.connection.create({
				index: self.config.index,
				type: 'user',
				id: props.id,
				body: props,
				refresh: true
			}, function(err) {
				if (err) return callback(err);

				callback(null, props);
			});
		} else if (err)
			return callback(err);
		else {
			return callback(new TelepatError(TelepatError.errors.UserAlreadyExists));
		}
	});
};

ElasticSearchDB.prototype.userCount = function(appId, callback) {
	this.connection.count({
		index: this.config.index,
		type: 'user'
	}, function(err, result) {
		if (err) return callback(err);

		callback(null, result.count);
	});
};

ElasticSearchDB.prototype.userUpdate = function(email, appId, patch, callback) {
	var self = this;
	var modifiedUser = null;

	async.waterfall([
		function(callback1) {
			self.userGet({email: email}, appId, callback1);
		},
		function(user, callback1) {
			modifiedUser = Delta.processObject(patch, user);

			self.connection.update({
				index: self.config.index,
				type: 'user',
				id: user.id,
				body: {
					doc: modifiedUser
				}
			}, callback1);
		}
	], function(err) {
		if (err) return callback(err);

		callback(null, modifiedUser);
	});
};

ElasticSearchDB.prototype.userDelete = function(email, appId, callback) {
	var self = this;
	var user = null;

	var appModels = null;
	var ancestorsAndSingleModels = [];
	var objectsToBeDeleted = [];

	async.series([
		function(callback1) {
			Application(appId, function(err, app) {
				if (err) return callback1(err);
				appModels = app.schema;
				callback1();
			});
		},
		function(callback1) {
			self.userGet({email: email}, appId, function(err, result) {
				if (err) return callback1(err);

				user = result;
				callback1();
			});
		},
		function deleteSubscriptions(callback1) {
			async.each(user.devices, function(deviceId, c1) {
				Application.redisClient.get('blg:devices:'+deviceId, function(err, response) {
					if (err) return c1(err);

					if (response) {
						var device = JSON.parse(response);
						if (device.subscriptions) {
							async.each(device.subscriptions, function(subscription, c2) {
								Application.redisClient.srem([subscription, deviceId], function(err, res) {});
								c2();
							});
						}
						Application.redisClient.del('blg:devices:'+deviceId, function(err, res) {});
					}
					c1();
				});
			});
			callback1();
		},
		function(callback1) {
			self.connection.delete({
				index: self.config.index,
				type: 'user',
				id: user.id,
				refresh: true
			}, function(err) {
				callback1(err);
			});
		},
		function(callback1) {
			if (appModels) {
				async.each(Object.keys(appModels), function(modelName, c) {
					if (!appModels[modelName].belongsTo) {
						ancestorsAndSingleModels.push({term: {type: modelName}});
					}
					c();
				}, callback1);
			} else {
				callback1();
			}
		},
		function(callback1) {
			//skip this step, application has no models that are parents or unrelated models
			if (ancestorsAndSingleModels.length == 0)
				return callback1();

			self.connection.search({
				index: self.config.index,
				//q: 'user_id:"'+user.id+'"',
				body: {
					query: {
						bool: {
							must: {term: {user_id: user.id}},
							should: ancestorsAndSingleModels,
							minimum_should_match: 1
						}
					}
				}
			}, function(err, results) {
				if (err) return callback1(err);

				results.hits.hits.forEach(function(item) {
					objectsToBeDeleted.push(item._source);
				});

				callback1();
			});
		},
		function(callback1) {
			//what if user only has child objects, we should delete them
			//because modelDelete also deletes child objects
			if (objectsToBeDeleted.length == 0) {
				self.connection.search({
					index: self.config.index,
					q: 'user_id:"'+user.id+'"'
				}, function(err, results) {
					if (err) return callback1(err);

					results.hits.hits.forEach(function(item) {
						objectsToBeDeleted.push(item._source);
					});

					callback1();
				});
			} else {
				callback1();
			}
		}
	], function(err) {
		callback(err, objectsToBeDeleted);
	});
};

module.exports = ElasticSearchDB;
