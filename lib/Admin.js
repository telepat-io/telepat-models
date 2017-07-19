'use strict';

const async = require('async');
const FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
const guid = require('uuid');
const TelepatError = require('./TelepatError');
const BaseModel = require('./BaseModel');
const Services = require('./Services');

class Admin extends BaseModel {
	constructor(props) {
		props.id = guid.v4();
		props.type = 'admin';

        const proxiedParent = super(props, ['application_id']);
		return proxiedParent;
	}

	static new(props, callback) {
		let newAdmin = new Admin(props);
		Services.datasource.dataStorage.createObjects([newAdmin], (err) => {
			callback(err, newAdmin.properties);
		});
	}

	static get(admin, callback) {
		if (admin.id) {
			Services.datasource.dataStorage.getObjects([admin.id], (errs, results) => {
				if (errs.length) {
					return callback(errs[0]);
				}
				callback(null, results[0]);
			});
		}
		else if (admin.email) {
			let filter = new FilterBuilder();
			filter.addFilter('is', {email: admin.email});
			Services.datasource.dataStorage.searchObjects({modelName: 'admin', filters: filter}, (err, results) => {
				if (err) {
					return callback(err);
				}

				if (!results.length) {
					return callback(new TelepatError(TelepatError.errors.AdminNotFound));
				}

				callback(null, results[0]);
			});
		}
	}

	static delete(admin, callback) {
		async.waterfall([
			callback1 => {
				this.get(admin, callback1);
			},
			callback1 => {
				let adminToDelete = {};
				
				adminToDelete[admin.id] = 'admin';
				Services.datasource.dataStorage.deleteObjects(adminToDelete, (errs) => {
					callback1(errs && errs.length ? errs[0] : null);
				});
			}
		], callback);
	}

	static update(patches, callback) {
		Services.datasource.dataStorage.updateObjects(patches, (errs) => {
			callback(errs && errs.length ? errs[0] : null);
		});
	}
}


module.exports = Admin;
