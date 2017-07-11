const Application = require('./Application');
const async = require('async');
const FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
const guid = require('uuid');

class Context extends BaseModel {
	constructor(props) {
		props.application_id = props.application_id;
		props.type = 'context';
        const proxiedParent = super(props, ['application_id']);
        return proxiedParent;
    }

	static get(_id, callback) {
		if(!Context.contexts[_id])
			Services.datasource.dataStorage.getObjects([_id], function(errs, results) {
				if (errs.length) return callback(errs[0]);
				callback(null, results[0]);
			});
		else callback(null, Context.contexts[_id]);
	}

	static new(props, callback) {
		props.id = guid.v4();
		Context.apps[props.id] = new Context(props);
		Services.datasource.dataStorage.createObjects([props], function(errs) {
			if (errs) return callback(errs[0]);
			return callback(null, TelepatApplication.apps[props.id]);
		});
	}

	delete(callback) {
		let id = this.properties.id;
		let delObj = {};
		delObj[id] = 'context';

		async.series([
			callback1 => {
				Services.datasource.dataStorage.deleteObjects(delObj, function(errs) {
					if (errs) return callback1(errs[0]);
					callback1();
				});
			},
			callback1 => {
				let deleteContextObjects = function(obj) {
					let deleteObjects = {};
					async.each(obj, (o, c) => {
						deleteObjects[o.id] = o.type;
						c();
					}, () => {
						Services.datasource.dataStorage.deleteObjects(deleteObjects, (errs) => {
							if (errs && errs.length > 1) {
								Services.logger.warning('Failed to delete '+errs.length+' context objects.');
							}
						});
					});
				};
				let filter = (new FilterBuilder()).addFilter('is', {context_id: id});
				Services.datasource.dataStorage.searchObjects({filters: filter, fields: ['id', 'type'], scanFunction: deleteContextObjects}, callback1);
			}, 
			callback1 => {
				if (err) {
					return callback(err);
				}
				let deletedContext =  Context.contexts[id];
				delete Context.contexts[id];
				callback(null, deletedContext);
			}
		], callback);

	}
}

Context.contexts = [] ;

module.exports = Context;
// function Context(_id, callback) {
// 	Services.datasource.dataStorage.getObjects([_id], function(errs, results) {
// 		if (errs.length) return callback(errs[0]);
// 		callback(null, results[0]);
// 	});
// }

// /**
//  * Loads the configuration spec file. Automatically called at module require.
//  */
// Context.load = function() {
// 	Context._model = require('../models/context.json');

// 	if (!Context._model) {
// 		Services.logger.emergency('Model \'context\' spec file does not exist.');
// 		process.exit(-1);
// 	}
// };

// /**
//  * Get all contexts.
//  * @param [by_app] integer Gets the context only from this application.
//  * @param callback
//  */
// Context.getAll = function(by_app, offset, limit, callback) {
// 	var filter = null;
// 	offset = offset || 0;
// 	limit = limit || Services.datasource.dataStorage.config.get_limit;

// 	if (by_app)
// 		filter = (new FilterBuilder('and')).addFilter('is', {application_id: by_app});

// 	Services.datasource.dataStorage.searchObjects({modelName: 'context', filters: filter, offset: offset, limit: limit}, callback);
// }

// /**
//  * Gets the curent index of the contexts.
//  * @param callback
//  */
// Context.count = function(callback) {
// 	Services.datasource.dataStorage.countObjects({modelName: 'context'}, callback);
// }


// /**
//  * Creates a new context
//  * @param props Object properties of the context
//  * @param callback
//  */
// Context.create = function(props, callback) {
// 	props.type = 'context';
// 	props.id = guid.v4();
// 	props.created = Math.floor((new Date()).getTime()/1000);
// 	props.modified = props.created;

// 	Services.datasource.dataStorage.createObjects([props], function(err) {
// 		if (err) return callback(err);
// 		callback(null, props);
// 	});
// }

// /**
//  * Updates a context.
//  * @param id integer Context ID
//  * @param patches[] Object The new properties of the context
//  * @param callback
//  */
// Context.update = function(patches, callback) {
// 	Services.datasource.dataStorage.updateObjects(patches, function(errs) {
// 		callback(errs.length ? errs[0] : null);
// 	});
// }

// /**
//  * Deletes a context and all of its objects and subscriptions
//  * @param id integer Context ID
//  * @param callback
//  */
// Context.delete = function(id, callback) {
// 	var delObj = {};
// 	delObj[id] = 'context';

// 	async.series([
// 		function(callback1) {
// 			Services.datasource.dataStorage.deleteObjects(delObj, function(errs) {
// 				if (errs) return callback1(errs[0]);
// 				callback1();
// 			});
// 		},
// 		function(callback1) {
// 			var deleteContextObjects = function(obj) {
// 				var deleteObjects = {};
// 				async.each(obj, function(o, c) {
// 					deleteObjects[o.id] = o.type;
// 					c();
// 				}, function() {
// 					Services.datasource.dataStorage.deleteObjects(deleteObjects, function(errs) {
// 						if (errs && errs.length > 1) {
// 							Services.logger.warning('Failed to delete '+errs.length+' context objects.');
// 						}
// 					});
// 				});
// 			};
// 			var filter = (new FilterBuilder()).addFilter('is', {context_id: id});
// 			Services.datasource.dataStorage.searchObjects({filters: filter, fields: ['id', 'type'], scanFunction: deleteContextObjects}, callback1);
// 		}
// 	], callback);
// }

// module.exports = Context;
