'use strict';

const BaseModel = require('./BaseModel');
const guid = require('uuid');
const Services = require('./Services');
const async = require('async');
const FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
const TelepatError = require('./TelepatError');
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
        return proxiedParent;
    }

	isAPNConfigured() {
		return !!(this.apn_key && this.apn_team_id);
    }

	isGCMCofigured() {
		return !!(this.gcm_api_key);
	}

	static new(props, callback) {
		props.application_id = guid.v4();
		TelepatApplication.apps[props.application_id] = new TelepatApplication(props);
		Services.datasource.dataStorage.createObjects([TelepatApplication.apps[props.application_id].properties], (errs) => {
			if (errs) {
				return callback(errs[0]);
			}

			return callback(null, TelepatApplication.apps[props.application_id]);
		});
		
	}

	static get(prop) {
		if(typeof this.prop == 'function') {
			return TelepatApplication.apps.prop;
		} 
		return TelepatApplication.apps[prop];
	}

	static getAll(limit, offset, callback) {
		offset = offset || 0;
		limit = limit || Services.datasource.dataStorage.config.get_limit;

		Services.datasource.dataStorage.searchObjects({modelName: 'application', offset: offset, limit: limit}, (err, applications) => {
			if (err){
				return callback(err);
			} 

			applications.forEach((app) => {
				TelepatApplication.apps[app.id] = app;
			});
			callback();
		});
	}



	delete(callback) {
		let id = this.application_id;

		async.series([
			callback1 => {
				let appObj = {};

				appObj[this.properties.id] = 'application';
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
		let id = this.application_id;

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

	hasContext(contextId, callback) {
		let appId = this.id;

		Services.datasource.dataStorage.getObjects([contextId], (err, results) => {
			if (err && err[0] && err[0].status == 404) {
				return callback(new TelepatError(TelepatError.errors.ContextNotFound));
			}

			callback(null, results[0].application_id == appId);

		});
	}

	static check(application_id, modelName) {
		let builtinModels = ['application_id', 'admin', 'user', 'user_metadata', 'context'];

		if (builtinModels.indexOf(modelName) !== -1) {
			return new TelepatError(TelepatError.errors.InvalidFieldValue, 'type');
		}

		if(!TelepatApplication.apps || !TelepatApplication.apps[application_id]) {
			return new TelepatError(TelepatError.errors.ApplicationNotFound, application_id);
		}
		if(!TelepatApplication.apps[application_id].schema) {
			return new TelepatError(TelepatError.errors.ApplicationHasNoSchema);
		}
		return false;

	}
	
	static belongsTo(application_id, modelName) {
		if(TelepatApplication.check(application_id, modelName)) {
			return false;
		}
		let belongs = [];
		let appModels = TelepatApplication.apps[application_id].schema; 

		for (let r in appModels[modelName].belongsTo) {
			let parentName = appModels[modelName].belongsTo[r].parentModel;
			let relationType = appModels[modelName].belongsTo[r].relationType;
			if (appModels[parentName] && appModels[parentName][relationType] && appModels[parentName][relationType].indexOf(modelName) !== -1) {
				belongs.push(parentName);
			}
		}
		return belongs;
	}

	model(modelName) {	
		return new Proxy({
			belongsTo: TelepatApplication.belongsTo(this.application_id, modelName),
			check: TelepatApplication.check(this.application_id, modelName)
		}, {
			get: (object,props) => {
				return object[props];
			}
		});
	}
	static models() {
		return Model;
	}


}

/**
 *  @property {TelepatApplication[]} apps All the apps
 */
TelepatApplication.apps = [];

module.exports = TelepatApplication;
