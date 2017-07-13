const async = require('async');
const FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
const guid = require('uuid');
const TelepatError = require('./TelepatError');
const Services = require('./Services');
const BaseModel = require('./');
class User extends BaseModel {
    constructor(props) {
        props.admins = Array.isArray(props.admins) ? props.admins : [];
        props.keys = Array.isArray(props.keys) ? props.keys : [];
		props.type = 'user';
    	if (!props.hasOwnProperty('friends')) {
		    props.friends = [];
        }

	    if (!props.hasOwnProperty('devices')) {
		    props.devices = [];
        }


        const proxiedParent = super(props, ['application_id']);
        return proxiedParent;
    }

    static get(user, appId, callback) {
     	if (user.id) {
		    Services.datasource.dataStorage.getObjects([user.id], function(errs, results) {
			    if (errs && errs.length > 0) {
                    return callback(errs[0]);
                }
			    callback(null, results[0]);
		    });
	    } else if (user.username) {
            let filters = (new FilterBuilder('and')).addFilter('is', {application_id: appId}).addFilter('is', {username: user.username});
            Services.datasource.dataStorage.searchObjects({modelName: 'user', filters: filters}, (err, results) => {
                if (err) {
                    return callback(err);
                }

                if (!results.length) {
                    return callback(new TelepatError(TelepatError.errors.UserNotFound));
                }
                callback(null, results[0]);
            });
        }
	}

    static new(props, callback) {
        let newUser = new User(props);

        let userMetadata = {
            id: guid.v4(),
            user_id: props.id,
            application_id: newUser.application_id,
            type: 'user_metadata'
        };

        this.get(newUser.username, newUser.application_id, (err, res) => {
            if (err && err.status == 404) {
			    Services.datasource.dataStorage.createObjects([newUser.properties, userMetadata], (errs) => {
				    if (errs && errs.length) {
					    errs.forEach(function(error) {
						    Services.logger.error(error.message);
					    });
					    return callback(new TelepatError(TelepatError.errors.ServerFailure, ['failed to create user.']));
                    }
                    callback(null, props);
				});
            }
            else {
			    callback(new TelepatError(TelepatError.errors.UserAlreadyExists));
	    	}		
		});
    }

    delete(props, callback) {
        let id = props.id;
        let appId = props.application_id;
        let user;
        async.series([
            (callback1) => {
			    get({id: id}, appId, (err, result) => {
                    if (err) { 
                        return callback1(err);
                    }

                    user = result;
                    callback1();
			    });
		    },
	        (callback1) => {
                async.each(user.devices, function(deviceId, c1) {
                    Services.redisClient.get('blg:devices:'+deviceId, function(err, response) {
                        if (err) {
                             return c1(err);
                        }
                        if (response) {
                            let device = JSON.parse(response);
                            if (device.subscriptions) {
                                let transaction = Services.redisClient.multi();

                                device.subscriptions.each((sub) => {
                                    transaction.srem([sub, deviceId]);
                                });

                                transaction.del('blg:devices:'+deviceId);

                                transaction.exec((err, res) => {
                                    if (err) {
                                         Services.logger.warning('Failed removing device from subscriptions: '+err.message);
                                    }
                                });
                            }
                        }
                        c1();
                    });
                });
			    callback1();
		    },
		    (callback1) => {
                let usrObj = {};
                usrObj[id] = 'user';
                Services.datasource.dataStorage.deleteObjects(usrObj, (errs) => {
                    callback1(errs && errs.length > 1 ? errs[0] : null);
                });
		    },
	        (callback1) => {
                let deleteUserObjects = (obj) => {
                    let deleteObjects = {};
                    async.each(obj,  (o, c) => {
                        deleteObjects[o.id] = o.type;
                        c();
                    }, () => {
                        Services.datasource.dataStorage.deleteObjects(deleteObjects, (errs) => {
                            if (errs && errs.length > 1) {
                                Services.logger.warning('Failed to delete '+errs.length+' user objects.');
                            }
                        });
                    });
                };
                let filter = (new FilterBuilder()).addFilter('is', {user_id: id});
                Services.datasource.dataStorage.searchObjects({filters: filter, fields: ['id', 'type'], scanFunction: deleteUserObjects}, callback1);
		    }
	    ], callback);
    }

    update(patches, callback) {
        Services.datasource.dataStorage.updateObjects(patches, (errs, dbObjects) => {
            if (errs.length) {
                return callback(errs[0]);
            }

            var objId = Object.keys(dbObjects)[0];

            callback(null, dbObjects[objId]);

        });
    }
}

// /**
//  * Gets an user by email address
//  * @param user Object object containing the id or email address of the user
//  * @param callback
//  * @constructor
//  */
// function User(user, appId, callback) {
// 	if (user.id) {
// 		Services.datasource.dataStorage.getObjects([user.id], function(errs, results) {
// 			if (errs && errs.length > 0) return callback(errs[0]);
// 			callback(null, results[0]);
// 		});
// 	} else if (user.username) {
// 		var filters = (new FilterBuilder('and')).addFilter('is', {application_id: appId}).addFilter('is', {username: user.username});
// 		Services.datasource.dataStorage.searchObjects({modelName: 'user', filters: filters}, function(err, results) {
// 			if (err)
// 				return callback(err);
// 			if (!results.length)
// 				return callback(new TelepatError(TelepatError.errors.UserNotFound));
// 			callback(null, results[0]);
// 		});
// 	}
// }

// /**
//  * Loads the configuration spec file. Automatically loaded at module require.
//  */
// User.load = function() {
// 	User._model = require('../models/user.json');

// 	if (!User._model) {
// 		Services.logger.emergency('Model \'user\' spec file does not exist.');
// 		process.exit(-1);
// 	}
// };

// /**
//  * Creates a user
//  * @param props Object Properties of the user.
//  * @param callback
//  */
// User.create = function(props, appId, callback) {
// 	var self = this;
// 	props.id = props.id || guid.v4();
// 	props.application_id = appId;
// 	props.created = Math.floor((new Date()).getTime()/1000);
// 	props.modified = props.created;
// 	props.type = 'user';

// 	if (!props.hasOwnProperty('friends'))
// 		props.friends = [];

// 	if (!props.hasOwnProperty('devices'))
// 		props.devices = [];

// 	var userMetadata = {
// 		id: guid.v4(),
// 		user_id: props.id,
// 		application_id: appId,
// 		type: 'user_metadata'
// 	};

// 	User({username: props.username}, appId, function(err, result) {
// 		if (err && err.status == 404) {
// 			Services.datasource.dataStorage.createObjects([props, userMetadata], function(errs) {
// 				if (errs && errs.length) {
// 					errs.forEach(function(error) {
// 						Services.logger.error(error.message);
// 					});
// 					return callback(new TelepatError(TelepatError.errors.ServerFailure, ['failed to create user.']));
// 				}

// 				callback(null, props);
// 			});
// 		} else {
// 			callback(new TelepatError(TelepatError.errors.UserAlreadyExists));
// 		}
// 	});
// }

// User.count = function(appId, callback) {
// 	var filters = null;
// 	if (appId)
// 		filters = (new FilterBuilder()).addFilter('is', {application_id: appId});

// 	Services.datasource.dataStorage.countObjects({modelName: 'user', filters: filters}, callback);
// }

// /**
//  * Updates a user
//  * @param patches Object[] The new/updated properties of the user.
//  * @param callback
//  */
// User.update = function(patches, callback) {
// 	Services.datasource.dataStorage.updateObjects(patches, function(errs, dbObjects) {
// 		if (errs.length) {
// 			return callback(errs[0]);
// 		}

// 		var objId = Object.keys(dbObjects)[0];

// 		callback(null, dbObjects[objId]);
// 	});
// }

// /**
//  * Deletes a user.
//  * @param id string Email address of the user.
//  * @param callback
//  */
// User.delete = function(id, appId, callback) {
// 	var user = null;

// 	async.series([
// 		function(callback1) {
// 			User({id: id}, appId, function(err, result) {
// 				if (err) return callback1(err);

// 				user = result;
// 				callback1();
// 			});
// 		},
// 		function deleteSubscriptions(callback1) {
// 			async.each(user.devices, function(deviceId, c1) {
// 				Services.redisClient.get('blg:devices:'+deviceId, function(err, response) {
// 					if (err) return c1(err);

// 					if (response) {
// 						var device = JSON.parse(response);
// 						if (device.subscriptions) {
// 							var transaction = Services.redisClient.multi();

// 							device.subscriptions.each(function(sub) {
// 								transaction.srem([sub, deviceId]);
// 							});

// 							transaction.del('blg:devices:'+deviceId);

// 							transaction.exec(function(err, res) {
// 								if (err) Services.logger.warning('Failed removing device from subscriptions: '+err.message);
// 							});
// 						}
// 					}
// 					c1();
// 				});
// 			});
// 			callback1();
// 		},
// 		function(callback1) {
// 			var usrObj = {};
// 			usrObj[id] = 'user';
// 			Services.datasource.dataStorage.deleteObjects(usrObj, function(errs) {
// 				callback1(errs && errs.length > 1 ? errs[0] : null);
// 			});
// 		},
// 		function(callback1) {
// 			var deleteUserObjects = function(obj) {
// 				var deleteObjects = {};
// 				async.each(obj, function(o, c) {
// 					deleteObjects[o.id] = o.type;
// 					c();
// 				}, function() {
// 					Services.datasource.dataStorage.deleteObjects(deleteObjects, function(errs) {
// 						if (errs && errs.length > 1) {
// 							Services.logger.warning('Failed to delete '+errs.length+' user objects.');
// 						}
// 					});
// 				});
// 			};
// 			var filter = (new FilterBuilder()).addFilter('is', {user_id: id});
// 			Services.datasource.dataStorage.searchObjects({filters: filter, fields: ['id', 'type'], scanFunction: deleteUserObjects}, callback1);
// 		}
// 	], callback);
// };

// User.getAll = function(appId, offset, limit, callback) {
// 	var filters = (new FilterBuilder()).addFilter('is', {application_id: appId});
// 	Services.datasource.dataStorage.searchObjects({modelName: 'user', filters: filters, offset: offset, limit: limit}, callback);
// };

// User.search = function(appId, filters, offset, limit, callback) {
// 	var filterBuilder = (new FilterBuilder()).addFilter('is', {application_id: appId});

// 	Object.keys(filters).forEach(function (field) {
// 		var fieldObject = {};
// 		fieldObject[field] = filters[field];
// 		filterBuilder.addFilter('like', fieldObject);
// 	});

// 	Services.datasource.dataStorage.searchObjects({modelName: 'user', filters: filterBuilder, offset: offset, limit: limit}, callback);
// };

// User.getMetadata = function(userId, callback) {
// 	var filters = (new FilterBuilder()).addFilter('is', {user_id: userId});
// 	Services.datasource.dataStorage.searchObjects({modelName: 'user_metadata', filters: filters}, function(err, results) {
// 		if (err) return callback(err);
// 		callback(null, results[0]);
// 	});
// };

// User.updateMetadata = function(userId, patches, callback) {
// 	Services.datasource.dataStorage.updateObjects(patches, function(errs) {
// 		callback(errs && errs.length ? errs[0] : null);
// 	});
// };

module.exports = User;
