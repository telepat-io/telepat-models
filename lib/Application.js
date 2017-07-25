'use strict';

const BaseModel = require('./BaseModel');
const guid = require('uuid');
const Services = require('./Services');
const async = require('async');
const FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
const TelepatError = require('./TelepatError');
const Context = require('./Context');
const Users = require('./User');
/**
 * @typedef {{
 * 		relationType: string,
 *		parentModel: string
 * }} Relation
 */

/**
 * @typedef {{
 * 		meta_read_acl: Number,
 * 		read_acl: Number,
 *		write_acl: Number,
 *		properties: Object,
 *		belongsTo: Relation[],
 *		hasSome: string[],
 *		hasMany: string[],
 *		hasSome_property: string,
 *		ios_push_field: string,
 *		author_fields: string[]
 * }} Model
 */

/**
 * @typedef {{
 * 		name: string,
 * 		keys: string[],
 * 		admins: string[],
 * 		type: "application",
 * 		email_confirmation: Boolean,
 * 		from_email: string,
 * 		password_reset: Object,
 *		password_reset.android_app_link: string,
 *		password_reset.app_link: string,
 *		password_reset.web_link: string,
 *		schema: Object.<string, Model>,
 *		apn_key: string,
 *		apn_key_id: string,
 *		apn_team_id: string,
 *		apn_topic: string,
 *		gcm_api_key: string,
 *		email_templates: {weblink: string, confirm_account: string, after_confirm: string, reset_password: string}
 * }} TelepatApplication
 */
class TelepatApplication extends BaseModel {
    /**
	 *
	 * @param {TelepatApplication} props
	 */
	constructor(props) {
        props.admins = Array.isArray(props.admins) ? props.admins : [];
        props.keys = Array.isArray(props.keys) ? props.keys : [];
		props.type = 'application';

        const proxiedParent = super(props, ['admins', 'keys']);
		proxiedParent.contexts = {
			new: (prop, callback) => {
				prop.application_id = proxiedParent.id;
				Context.new(prop, callback); 
			},
			get: Context.get, 
			update: Context.update, 
			delete: Context.delete
		};
		proxiedParent.users = {
			new: (prop, callback) => {
				prop.application_id = this.id;
				Users.new(prop, callback); 
			},
			get: (user, callback) => {
				 Users.get(user, this.id, callback);
			},  
			update: Users.update, 
			delete: Users.delete
		};
        return proxiedParent;
    }

	static new(props, callback) {
		props.id = guid.v4();
		let app = new TelepatApplication(props);

		Services.datasource.dataStorage.createObjects([app], (errs) => {
			if (errs) {
				return callback(errs[0]);
			}
			TelepatApplication.apps[props.id] = app;
			return callback(null, TelepatApplication.apps[props.id]);
		});
		
	}

	static get(id) {
		if (!TelepatApplication[id] || TelepatApplication[id] !== 'function') {
			return TelepatApplication.apps[id];
		} else {
			return TelepatApplication[id];
		}
	}

	delete(callback) {
		let id = this.id;

		async.series([
			callback1 => {
				let appObj = {};

				appObj[this.id] = 'application';
				Services.datasource.dataStorage.deleteObjects(appObj, callback1);
			},
			callback1 => {
				delete TelepatApplication.apps[id];

				let deleteAppObjects = (obj) => {
					let deleteObjects = {};

					async.each(obj, (o, c) => {
						deleteObjects[o.id] = o.type;
						c();
					}, () => {
						Services.datasource.dataStorage.deleteObjects(deleteObjects, (errs) => {
							if (errs && errs.length > 1) {
								Services.logger.warning('Failed to delete '+errs.length+' application objects.');
							}
						});
					});
				};
				let filter = (new FilterBuilder()).addFilter('is', {application_id: id});

				Services.datasource.dataStorage.searchObjects({filters: filter, fields: ['id', 'type'], scanFunction: deleteAppObjects}, callback1);
			},
			callback1 => {
				Services.redisClient.del(`blg:application:${id}`, callback1);
			}
		], callback);
	}

	update(patches, callback) {
		let id = this.id;

		async.waterfall([
			callback1 => {
				Services.datasource.dataStorage.updateObjects(patches, (errs, apps) => {
					if (errs && errs.length) {
						return callback1(errs[0]);
					}
					TelepatApplication.apps[id] = apps[id];
					callback1(null, apps[id]);
				});
			},
			(application, callback1) => {
				Services.redisClient.del(`blg:application:${id}`, (err) => {
					if (err) {
						return callback1(err);
					}

					callback1(null, application);
				});
			}
		], callback);
	}

	static getAll(limit, offset, callback) {
		offset = offset || 0;
		limit = limit || Services.datasource.dataStorage.config.get_limit;

		Services.datasource.dataStorage.searchObjects({modelName: 'application', offset: offset, limit: limit}, (err, applications) => {
			if (err) {
				return callback(err);
			} 

			applications.forEach((app) => {
				TelepatApplication.apps[app.id] = new TelepatApplication(app);
			});
			callback(null, TelepatApplication.apps);
		});
	}

	hasContext(contextId, callback) {
		let appId = this.id;
		Context.get(contextId, (err, res) => {
			if(err) {
				return callback(err);
			}
			return callback(null, res.application_id === appId);
		});
	}

 	hasAdmin(admin) {
		let appId = this.id;
		if (admin.id && TelepatApplication.apps[appId].admins.indexOf(admin.id) !== -1) {
			return true;
		}
		if(TelepatApplication.apps[appId].admins.indexOf(admin.email) !== -1) {
			return true;
		}
		return false;
	}

	static isAlreadyAdmin(admin) {
		TelepatApplication.apps.forEach((app) => {
			if (app.admins.indexOf(admin.id) !== -1) {
				return true;
			}
			if (app.admins.indexOf(admin.email) !== -1) {
				return true;
			}
		}); 
		return false;
	}

	isAPNConfigured() {
		return !!(this.apn_key && this.apn_team_id);
    }

	isGCMCofigured() {
		return !!(this.gcm_api_key);
	}

	static isBuiltIn(modelName) {
		if(TelepatApplication.builtinModels.indexOf(modelName) !== -1) {
			return true;
		}
		return false;
	}
	
	static isValid(id, modelName) {
		if (TelepatApplication.builtinModels.indexOf(modelName) !== -1) {
			return false;
		}

		if(!TelepatApplication.apps || !TelepatApplication.apps[id]) {
			return false;
		}

		if(!TelepatApplication.apps[id].schema) {
			return false;
		}

		if(!TelepatApplication.apps[id].schema[modelName]) {
			return false;
		}

		return true;

	}
	
	static getError(id, modelName) {
		if (!TelepatApplication.isValid(id, modelName)) {
			if (TelepatApplication.builtinModels.indexOf(modelName) !== -1) {
				return new TelepatError(TelepatError.errors.InvalidFieldValue, modelName);
			}

			if(!TelepatApplication.apps || !TelepatApplication.apps[id]) {
				return new TelepatError(TelepatError.errors.ApplicationNotFound, id);
			}

			if(!TelepatApplication.apps[id].schema) {
				return new TelepatError(TelepatError.errors.ApplicationHasNoSchema);
			}

			if(!TelepatApplication.apps[id].schema[modelName]) {
				return new TelepatError(TelepatError.errors.ApplicationSchemaModelNotFound, id, modelName);
			}
		}
		return false; 
	}

	static belongsTo(application_id, modelName) {
		if (!TelepatApplication.isValid(application_id, modelName)) {
			return TelepatApplication.getError(application_id, modelName);
		}
		let belongs = [];
		let appModels = TelepatApplication.apps[application_id].schema; 

		if (!appModels[modelName].belongsTo) {
			return [];
		}

		for (let r in appModels[modelName].belongsTo) {
			let parentName = appModels[modelName].belongsTo[r].parentModel;
			let relationType = appModels[modelName].belongsTo[r].relationType;
			if(relationType) {
				if (appModels[parentName] && appModels[parentName][relationType] && appModels[parentName][relationType] == modelName) {
					belongs.push(parentName);
				}
			} else {
				belongs.push(parentName);
			}
		}
		return belongs;
	}

	static hasParent(application_id, modelName, modelParent) {
		let appModels = TelepatApplication.apps[application_id].schema;
		
		if (!appModels[modelName].belongsTo) {
			return false;
		}

		if(!appModels[modelParent]) {
			return false;
		}
		let relationType = appModels[modelName].belongsTo.relationType;

		
		if (appModels[modelParent].belongsTo.parentModel !== modelName) {
			return false;
		}
		
		if(relationType) {
			if(appModels[modelParent][relationType].indexOf(modelName) === -1) {
				return false;
			}
		}

		return true;
	}

	model(modelName) {	
		return {
			belongsTo: TelepatApplication.belongsTo(this.id, modelName),
			isValid:  TelepatApplication.isValid(this.id, modelName),
			count:  (callback) => {
				let filter = new FilterBuilder();
				filter.addFilter('is', {application_id: this.id});
				Services.countObjects({modelName: modelName, filters: filter}, callback);
			},
			hasParent: (modelParent) => {
				return TelepatApplication.hasParent(this.id, modelName, modelParent);
			}
		};
	}
}
TelepatApplication.builtinModels =  ['application_id', 'admin', 'user', 'user_metadata', 'context'];

/**
 *  @property {TelepatApplication[]} apps All the apps
 */
TelepatApplication.apps = [];

module.exports = TelepatApplication;
