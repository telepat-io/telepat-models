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

let builtinModels = ['application', 'admin', 'user', 'user_metadata', 'context'];

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

		Services.datasource.dataStorage.createObjects([app.properties], (errs) => {
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
								Services.logger.warning('Failed to delete ' + errs.length + ' application objects.');
							}
						});
					});
				};
				let filter = (new FilterBuilder()).addFilter('is', { application_id: id });

				Services.datasource.dataStorage.searchObjects({ filters: filter, fields: ['id', 'type'], scanFunction: deleteAppObjects }, callback1);
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

					let application = apps[id];

					if (!(apps[id] instanceof TelepatApplication)) {
						application = new TelepatApplication(apps[id]);
					}

					TelepatApplication.apps[id] = application;
					callback1(null, application);
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

	static getAll(callback) {
		let offset = 0;
		let limit = Services.datasource.dataStorage.config.get_limit;

		Services.datasource.dataStorage.searchObjects({ modelName: 'application', offset: offset, limit: limit }, (err, applications) => {
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
			if (err) {
				return callback(err);
			}

			return callback(null, res.application_id === appId);
		});
	}

	static isAdmin(admin) {
		for (let r in TelepatApplication.apps) {
			if (TelepatApplication.apps[r].admins.indexOf(admin.id) !== -1) {
				return true;
			}
		}
		return false;
	}

	isAPNConfigured() {
		return (this.apn_key && this.apn_key_id && this.apn_team_id && this.apn_topic);
	}

	isGCMCofigured() {
		return !!(this.gcm_api_key);
	}

	static isBuiltInModel(modelName) {
		if (builtinModels.indexOf(modelName) !== -1) {
			return true;
		}
		return false;
	}

	modelSchema(modelName) {
		let schemaObj = this.properties.schema;
		let obj = {};

		obj.belongsTo = (parentName) => {
			if (schemaObj[modelName].belongsTo) {
				return !!schemaObj[modelName].belongsTo.find(parent => parent.parentModel === parentName);
			}
			return false;
		};

		obj.hasParent = (modelParent) => {
			let application_id = this.id;
			let appModels = TelepatApplication.apps[application_id].schema;

			if (!appModels[modelName].belongsTo) {
				return false;
			}

			if (!appModels[modelParent]) {
				return false;
			}
			let relationType = appModels[modelName].belongsTo.relationType;


			if (appModels[modelParent].belongsTo.parentModel !== modelName) {
				return false;
			}

			if (relationType) {
				if (appModels[modelParent][relationType].indexOf(modelName) === -1) {
					return false;
				}
			}

			return true;
		};

		obj.hasSome = (modelParent) => {
			if ((schemaObj[modelName].hasSome.indexOf(modelParent) !== -1)) {
				return schemaObj[modelName].hasSome_property;
			}
			return false;
		};

		obj.hasMany = (modelParent) => {
			return (schemaObj[modelName].hasMany.indexOf(modelParent) !== -1);
		};

		obj.isValidModel = () => {
			let app = TelepatApplication.apps[this.properties.id];

			if (TelepatApplication.isBuiltInModel(modelName)) {
				return new TelepatError(TelepatError.errors.InvalidFieldValue, modelName);
			}

			if (!app.schema) {
				return new TelepatError(TelepatError.errors.ApplicationHasNoSchema);
			}

			if (!app.schema[modelName]) {
				return new TelepatError(TelepatError.errors.ApplicationSchemaModelNotFound, this.properties.id, modelName);
			}

			return true;
		};

		return obj;
	}

	updateSchema(schema, callback) {
		let appId = this.id;

		async.series([
			(callback1) => {
				Services.datasource.dataStorage.updateObjects([
					{
						op: 'replace',
						path: 'application/' + appId + '/schema',
						value: schema
					}
				], (errs) => {
					callback1(errs && errs.length ? errs[0] : null);
				});
			},
			(callback1) => {
				Services.redisClient.del('blg:application:' + appId, (err, result) => {
					if (err) return callback1(err);
					callback1(null, schema);
				});
			}
		], callback);
	}

	deleteModel(modelName, callback) {
		let appId = this.id;
		let validation = TelepatApplication.apps[appId].modelSchema(modelName).isValidModel();

		if (validation instanceof TelepatError) {
			return validation;
		}

		async.series([
			(callback1) => {
				delete TelepatApplication.apps[appId].schema[modelName];
				Services.datasource.dataStorage.updateObjects([
					{
						op: 'replace',
						path: 'application/' + appId + '/schema',
						value: TelepatApplication.apps[appId].schema
					}
				], (errs, results) => {
					if (errs && errs.length)
						return callback1(errs[0]);
					callback1();
				});
			},
			(callback1) => {
				Services.redisClient.del('blg:application:' + appId, callback1);
			}
		], callback);
	}


}
/**
 *  @property {TelepatApplication[]} apps All the apps
 */
TelepatApplication.apps = [];

module.exports = TelepatApplication;
