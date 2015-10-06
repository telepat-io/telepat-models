var guid = require('uuid');
var Application = require('./Application');

var Delta = function(op, value, path, channel, globalId, ts) {
	this.op = op;
	this.value = value;
	this.path = path;
	/**
	 * @type {Channel}
	 */
	this.channel = channel || null;
	//user for user deltas
	this.email = null;
	this.subscription = null;
	this.guid = globalId || null;
	this.ts = ts || null;
	this.application_id = null;
	this.context = null;
};

Delta.OP = {
	ADD: 'add',
	INCREMENT: 'increment',
	REPLACE: 'replace',
	DELETE: 'delete'
};

Delta.prototype.setChannel = function(channel) {
	this.channel = channel;
};

Delta.prototype.clone = function() {
	var d = new Delta(this.op, this.value, this.path, this.channel, this.guid, this.ts);
	d.subscription = this.subscription;
	d.application_id = this.application_id;
	d.context = this.context;

	if (this.email)
		d.email = this.email;

	return d;
};

Delta.prototype.toObject = function() {
	var obj = {guid: this.guid,
		op: this.op,
		value: this.value,
		path: this.path,
		subscription: this.channel.get(),
		ts: this.ts,
		application_id: this.application_id,
		context: this.context
	};

	if (this.email)
		obj.email = this.email;

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

Delta.fromObject = function(object) {
	var d = new Delta(object.op, object.value, object.path, object.channel, object.guid, object.ts);
	d.subscription = object.subscription;
	d.application_id = object.application_id;
	d._microtime = object._microtime;
	d.context = object.context;
	if (object.email)
		d.email = object.email;

	return d;
};

module.exports = Delta;
