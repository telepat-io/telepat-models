var MessagingClient = function(config, name, channel) {
	this.config = config || {};
	this.channel = channel;
	this.connectionClient = null;
	this.onReadyFunc = null;
};

MessagingClient.prototype.onMessage = function(callback) {
	throw new Error('Unimplemented onMessage function.');
};

MessagingClient.prototype.onReady = function(callback) {
	this.onReadyFunc = callback;
};

/**
 * @override
 * @param message
 * @param opts
 */
MessagingClient.prototype.send = function(message, channel, opts) {
	throw new Error('Unimplemented send function.');
};

MessagingClient.prototype.shutdown = function(callback) {
	throw new Error('Unimplemented shutdown function.');
};

MessagingClient.prototype.getName = function() {
	return this.config.name;
};

MessagingClient.prototype.on = function(event, callback) {
	if (typeof this.connectionClient.on == 'function')
		this.connectionClient.on(event, callback);
};

module.exports = MessagingClient;
