var MessagingClient = function(config, name, channel) {
	this.broadcast = config.broadcast ? true : false;
	delete config.broadcast;

	this.config = config || {};
	this.channel = config.exclusive ? name : channel;
	this.name = name;
	this.connectionClient = null;
	this.onReadyFunc = null;
};

/**
 * @callback onMessageCb
 * @param {string} data
 */
/**
 * @abstract
 * @param {onMessageCb} callback
 */
MessagingClient.prototype.onMessage = function(callback) {
	throw new Error('Unimplemented onMessage function.');
};

/**
 * @abstract
 * @param {onMessageCb} callback
 */
MessagingClient.prototype.onSystemMessage = function(callback) {
	throw new Error('Unimplemented onSystemMessage function.');
};

MessagingClient.prototype.onReady = function(callback) {
	this.onReadyFunc = callback;
};

/**
 * @abstract
 * @param {string[]} messages
 * @param {string} channel
 * @param callback
 */
MessagingClient.prototype.send = function(message, channel, callback) {
	throw new Error('Unimplemented send function.');
};

/**
 * @abstract
 * @param message
 * @param callback
 */
MessagingClient.prototype.sendSystemMessages = function(message, callback) {
	throw new Error('Unimplemented sendSystemMessages function.');
};

/**
 * @abstract
 * @param {string[]} messages
 * @param {string} channel
 * @param callback
 */
MessagingClient.prototype.publish = function(message, channel, callback) {
	throw new Error('Unimplemented publish function.');
};

MessagingClient.prototype.shutdown = function(callback) {
	throw new Error('Unimplemented shutdown function.');
};

MessagingClient.prototype.on = function(event, callback) {
	if (typeof this.connectionClient.on == 'function')
		this.connectionClient.on(event, callback);
};

module.exports = MessagingClient;
