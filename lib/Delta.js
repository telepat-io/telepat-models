var guid = require('uuid');
var Application = require('./Application');
var cloneObject = require('clone');

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


/*Delta.prototype.clone = function() {
	var d = new Delta(this.op, this.value, this.path, this.channel, this.guid, this.ts);
	d.subscription = this.subscription;
	d.application_id = this.application_id;

	if (this.context)
		d.context = this.context;

	if (this.username)
		d.username = this.username;

	if (this.instant)
		d.instant = this.instant;

	return d;
};*/

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
	for (var i in patches) {
		var objectField = patches[i].path.split('/')[2];

		if (patches.hasOwnProperty(i) && ['id', 'type', 'created', 'modified', 'application_id', 'context_id'].indexOf(objectField) == -1) {
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
		}
	}

	object.modified = Math.floor((new Date()).getTime()/1000);

	return object;
};

module.exports = Delta;
