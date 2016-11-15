var guid = require('uuid');
var Application = require('./Application');
var cloneObject = require('clone');

/**
 *
 * @param {Object} fields
 * @param {string} fields.op
 * @param {Object} fields.object
 * @param {Object[]} fields.patch
 * @param {string} fields.application_id
 * @param {string} fields.timestamp
 * @param {string} [fields.instant]
 * @param {Channel[]} subscriptions
 * @constructor
 */
var Delta = function(fields, subscriptions) {
	this.op = fields.op;
	this.object = fields.object;
	this.patch = fields.patch;
	this.application_id = fields.application_id;
	this.timestamp = fields.timestamp;
	if (this.instant)
		this.instant = fields.instant;
	this.subscriptions = subscriptions || [];
};

Delta.OP = {
	ADD: 'add',
	INCREMENT: 'increment',
	REPLACE: 'replace',
	DELETE: 'delete'
};

Delta.prototype.toObject = function() {
	var obj = {
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
};

Delta.formPatch = function(object, op, property) {
	var patch = {};

	if (op)
		patch.op = op;

	if (property) {
		var prop = Object.keys(property)[0];
		patch.path = object.type+'/'+object.id+'/'+prop;
		patch.value = property[prop];
	} else if (object.id) {
		patch.path = object.type+'/'+object.id;
	}

	return patch;
};

Delta.processObject = function(patches, object) {
	var appliedPatches = 0;

	for (var i in patches) {
		var objectField = patches[i].path.split('/')[2];
		var objectModel = patches[i].path.split('/')[0];

		if (object._metadata && object._metadata.timestamps && object._metadata.timestamps[objectField]) {
			var objectFieldTimestamp = object._metadata.timestamps[objectField];
			var patchTimestamp = patches[i].timestamp || (new Date()).getTime();

			if (patchTimestamp < objectFieldTimestamp) {
				break;
			}
		}

		if (patches.hasOwnProperty(i) && ['id', 'type', 'created', 'modified', 'application_id', 'context_id', '_metadata'].indexOf(objectField) == -1) {
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
						var idx = object[objectField].indexOf(patches[i].value);
						if (idx !== -1)
							object[objectField].splice(idx, 1);
					}

					break;
				}
			}

			if (!object._metadata) {
				object._metadata = {timestamps: {}};
			} else if (!object._metadata.timestamps) {
				object._metadata.timestamps = {};
			}

			object._metadata.timestamps[objectField] = (new Date()).getTime();
			appliedPatches++;
		} else {
			Application.logger.error('Could not apply patch "' + patches[i].path + '": cannot modify built-in property');
		}
	}

	if (appliedPatches != 0) {
		object.modified = Math.floor((new Date()).getTime()/1000);
	} else {
		return false;
	}

	return object;
};

module.exports = Delta;
