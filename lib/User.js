const async = require('async');
const FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
const guid = require('uuid');
const TelepatError = require('./TelepatError');
const Services = require('./Services');
const BaseModel = require('./BaseModel');

class User extends BaseModel {
	constructor(props) {
		props.type = 'user';      
		if (!props.hasOwnProperty('friends')) {
			props.friends = [];
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

				callback(null, new User(results[0]));
			});
		} else if (user.username) {
			let filters = (new FilterBuilder('and')).addFilter('is', {"application_id": appId}).addFilter('is', {"username": user.username});

			Services.datasource.dataStorage.searchObjects({modelName: 'user', filters: filters}, (err, results) => {
				if (err) {
					return callback(err);
				}

				if (!results.length) {
					return callback(new TelepatError(TelepatError.errors.UserNotFound));
				}

				callback(null, new User(results[0]));
			});
		}
	}

	static new(props, callback) {
		props.id = props.id || guid.v4();
		let userMetadata = {
			id: guid.v4(),
			user_id: props.id,
			application_id: props.application_id,
			type: 'user_metadata'
		};

		let newUser = new User(props);

		User.get({username: newUser.username}, newUser.application_id, (err) => {
			if (err && err.status == 404) {
				Services.datasource.dataStorage.createObjects([newUser.properties, userMetadata], (errs) => {
					if (errs && errs.length) {
						errs.forEach(function(error) {
							Services.logger.error(error.message);
						});
						return callback(new TelepatError(TelepatError.errors.ServerFailure, ['failed to create user.']));
					}
				
					callback(null, newUser);
				});
			}
			else {
				callback(new TelepatError(TelepatError.errors.UserAlreadyExists));
			}		
		});
	}

	static getMetadata(userId, callback) {
		let filters = (new FilterBuilder()).addFilter('is', {user_id: userId});

		Services.datasource.dataStorage.searchObjects({modelName: 'user_metadata', filters: filters}, (err, results) => {
			if (err) return callback(err);
			callback(null, results[0]);
		});
	}

	static updateMetadata(userId, patches, callback) {
		Services.datasource.dataStorage.updateObjects(patches, (errs) => {
			callback(errs && errs.length ? errs[0] : null);
		});
	}
	
	static delete(props, callback) {
		let id = props.id;
		let appId = props.application_id;
		let user;

		async.series([
			(callback1) => {
				User.get({id: id}, appId, (err, result) => {
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

								transaction.exec((err) => {
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

	static update(patches, callback) {
		Services.datasource.dataStorage.updateObjects(patches, (errs, dbObjects) => {
			if (errs.length) {
				return callback(errs[0]);
			}
			let objId = Object.keys(dbObjects)[0];

			callback(null, dbObjects[objId]);
		});
	}

	static getAll(appId, offset, limit, callback) {
		let filters = (new FilterBuilder()).addFilter('is', {application_id: appId});
		
		Services.datasource.dataStorage.searchObjects({modelName: 'user', filters: filters, offset: offset, limit: limit}, callback);
	}
}

module.exports = User;
