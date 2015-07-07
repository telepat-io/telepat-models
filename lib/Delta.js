var guid = require('uuid');
var Application = require('./Application');

var Delta = function(op, value, path, channel, globalId) {
	this.op = op;
	this.value = value;
	this.path = path;
	/**
	 * @type {Channel}
	 */
	this.channel = channel || null;
	this.guid = globalId || guid.v4();
	this.ts = process.hrtime().join('');
};

Delta.prototype.setChannel = function(channel) {
	this.channel = channel;
};

Delta.prototype.clone = function() {
	var d = new Delta(this.op, this.value, this.path, this.channel, this.guid);

	return d;
};

Delta.prototype.toObject = function() {
	return {guid: this.guid,
		op: this.op,
		value: this.value,
		path: this.path,
		subscription: this.channel.get()
	};
};

module.exports = Delta;
