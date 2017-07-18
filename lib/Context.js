const async = require('async');
const FilterBuilder = require('../utils/filterbuilder').FilterBuilder;
const guid = require('uuid');
const BaseModel = require('./BaseModel');
const Services = require('./Services');
class TelepatContext extends BaseModel {
	constructor(props) {
		props.type = 'context';
        const proxiedParent = super(props, ['application_id']);
        return proxiedParent;
    }

	static get(id, callback) {
		Services.datasource.dataStorage.getObjects([id], (errs, results) => {
			if (errs.length) {
				return callback(errs[0]);
			}

			callback(null, results[0]);
		});
	}

	static new(props, callback) {
		props.id = guid.v4();
		let createdContext = new TelepatContext(props);
		Services.datasource.dataStorage.createObjects([createdContext.properties], (errs) => {
			if (errs) {
				 return callback(errs[0]);
			}
			return callback(null, createdContext);
		});
	}

	delete(callback) {
		let id = this.properties.id;
		let delObj = {};
		delObj[id] = 'context';

		async.series([
			callback1 => {
				Services.datasource.dataStorage.deleteObjects(delObj, (errs) => {
					if (errs) {
						 return callback1(errs[0]);
					}
					callback1();
				});
			},
			callback1 => {
				let deleteContextObjects = (obj) => {
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
			}
		], callback);
	}

	update(patches, callback) {
		Services.datasource.dataStorage.updateObjects(patches, (errs) => {
			callback(errs.length ? errs[0] : null);
		});
	}
}

module.exports = TelepatContext;