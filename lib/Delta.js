/**
 * @typedef {{
 * 		op: Delta.PATCH_OP,
 *		path: string,
 *		value: any,
 *		[timestamp]: Number
 * }} Patch
 */

/**
 *
 * @param {Object} fields
 * @param {Delta.OP} fields.op
 * @param {Object} fields.object
 * @param {Patch[]} fields.patch
 * @param {string} fields.application_id
 * @param {string} fields.timestamp
 * @param {string} [fields.instant]
 * @param {Channel[]} subscriptions
 * @constructor
 */
class Delta {
	constructor(fields, subscriptions) {
		this.op = fields.op;
		this.object = fields.object;
		this.patch = fields.patch;
		this.application_id = fields.application_id;
		this.timestamp = fields.timestamp;
		if (this.instant) {
			this.instant = fields.instant;
		}
		this.subscriptions = subscriptions || [];
	}

	toObject() {
		let obj = {
			op: this.op,
			object: this.object,
			subscriptions: this.subscriptions,
			application_id: this.application_id,
			timestamp: this.timestamp
		};

		if (this.op == 'update')
			obj.patch = this.patch;

		if (this.instant)
			obj.instant = true;

		return obj;
	}

	static formPatch(object, op, property) {
		let patch = {};

		if (op)
			patch.op = op;

		if (property) {
			let prop = Object.keys(property)[0];
			patch.path = `${object.type}/${object.id}/${prop}`;
			patch.value = property[prop];
		} else if (object.id) {
			patch.path = `${object.type}/${object.id}`;
		}

		return patch;
	}

	static processObject(patches, object) {
		for (let i in patches) {
			let objectField = patches[i].path.split('/')[2];
			if (patches.hasOwnProperty(i)) {
				switch (patches[i].op) {
				case 'replace': {
					object[objectField] = patches[i].value;

					break;
				}

				case 'increment': {
					object[objectField] += patches[i].value;

					break;
				}

				case 'append': {
					if (Array.isArray(object[objectField])) {
						object[objectField].push(patches[i].value);
					} else if (typeof object[objectField] == 'string') {
						object[objectField] += patches[i].value;
					} else if (object[objectField] === undefined) {
						object[objectField] = [patches[i].value];
					}

					break;
				}

				case 'remove': {
					if (Array.isArray(object[objectField])) {
						let idx = object[objectField].indexOf(patches[i].value);
						if (idx !== -1)
							object[objectField].splice(idx, 1);
					}

					break;
				}
				}
			}
		}

		return object;
	}
}

/**
 * @enum {string}
 * @type {{ADD: string, UPDATE: string, DELETE: string}}
 */
Delta.OP = {
	ADD: 'add',
	UPDATE: 'update',
	DELETE: 'delete'
};

/**
 * @enum {string}
 * @type {{APPEND: string, INCREMENT: string, REPLACE: string, REMOVE: string}}
 */
Delta.PATCH_OP = {
	APPEND: 'append',
	INCREMENT: 'increment',
	REPLACE: 'replace',
	REMOVE: 'remove'
};

module.exports = Delta;
