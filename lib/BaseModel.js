'use strict';

const TelepatError = require('./TelepatError');

let immutableProperties = {
	id: true,
	created: true,
	modified: true,
	type: true
};

/**
 * @typedef {{
 * 		id: string|Number,
 * 		created: Number,
 * 		modified: Number,
 * 		type: string
 * }} BaseModel
 */
class BaseModel {
	constructor(props, moreImmutableProps) {
		if (typeof props.type !== 'string') {
			throw new TelepatError(TelepatError.errors.MissingRequiredField, ['type']);
		}

		moreImmutableProps.forEach(prop => {
			immutableProperties[prop] = true;
		});
		this.properties = props;
		this.properties.created = this.properties.created || Date.now();
		this.properties.modified = this.properties.modified || this.properties.created;

		return new Proxy(this, {
			set: (object, property, value) => {
				if (immutableProperties[property]) {
					return true;
				} else {
					object.properties[property] = value;
					object.properties.modified = Date.now();
					return true;
				}
			},
			get: (object, property) => {
				if (property === 'properties') {
					return object.properties;
				}
				return object.properties[property] || object[property] || undefined;
			}
		});
	}

	serialize() {
		return this.properties;
	}
    
	isImmutable(prop) {
		return immutableProperties[prop];
	}


	set immutableProperties (newProperties) {
		immutableProperties = newProperties;
	}

	get immutableProperties () {
		return immutableProperties;
	}
}

module.exports = BaseModel;
