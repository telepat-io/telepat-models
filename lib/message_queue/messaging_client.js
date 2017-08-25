

class MessagingClient {
	constructor(config, name, channel) {
		this.broadcast = config.broadcast ? true : false;
		delete config.broadcast;

		this.config = config || {};
		this.channel = config.exclusive ? name : channel;
		this.name = name;
		this.connectionClient = null;
		this.onReadyFunc = null;
	}
	/**
	 * @callback onMessageCb
	 * @param {string} data
	 */
	/**
	 * @abstract
	 * @param {onMessageCb} callback
	 */
	onMessage(callback) {
		throw new Error('Unimplemented onMessage function.');
	}

	onReady(callback) {
		this.onReadyFunc = callback;
	}

	/**
	 * @abstract
	 * @param {string[]} messages
	 * @param {string} channel
	 * @param callback
	 */
	send(message, channel, callback) {
		throw new Error('Unimplemented send function.');
	}

	/**
	 * @abstract
	 * @param message
	 * @param callback
	 */
	sendSystemMessages(message, callback) {
		throw new Error('Unimplemented sendSystemMessages function.');
	}

	/**
	 * @abstract
	 * @param {string[]} messages
	 * @param {string} channel
	 * @param callback
	 */
	publish(message, channel, callback) {
		throw new Error('Unimplemented publish function.');
	}

	shutdown(callback) {
		throw new Error('Unimplemented shutdown function.');
	}

	on(event, callback) {
		if (typeof this.connectionClient.on == 'function')
			this.connectionClient.on(event, callback);
	}
}

module.exports = MessagingClient;
