/**
 *
 * @type {MessagingClient|exports|module.exports}
 */
var MessagingClient = require('./messaging_client');
var amqplib = require('amqplib/callback_api');
var async = require('async');
var Application = require('../Application');
var lz4 = require('../../utils/utils').lz4;

var AMQPClient = function(config, name, channel) {
	MessagingClient.call(this, config, name, channel);

	this.config = config;
	var self = this;
	this.amqpChannel = null;
	this.broadcastQueue = null;
	this.assertedQueues = {};

	async.series([
		function TryConnecting(callback) {
			amqplib.connect('amqp://'+self.config.user+':'+self.config.password+'@'+self.config.host, function(err, conn) {
				if (err) {
					Application.logger.error('Failed connecting to AMQP messaging queue ('+
						err.toString()+'). Retrying... ');
					setTimeout(function() {
						TryConnecting(callback);
					}, 1000);
				} else {
					self.connectionClient = conn;
					callback();
				}
			});
		},
		function TryChannel(callback) {
			self.connectionClient.createChannel(function(err, ch) {
				if (err) {
					Application.logger.error('Failed creating channel on the AMQP messaging queue ('+
						err.toString()+'). Retrying... ');
					setTimeout(function() {
						TryChannel(callback);
					}, 1000);
				} else {
					self.amqpChannel = ch;
					//create queue or exchange if it doesnt exist; used for consumers
					if (self.broadcast) {
						self.amqpChannel.assertExchange(self.channel+'-exchange', 'fanout', {}, function(err) {
							if (err) return callback(err);
							self.amqpChannel.assertQueue(self.name, {durable: false, autoDelete: true}, function(err1, result) {
								if (err1) return callback(err1);

								self.broadcastQueue = result.queue;
								self.amqpChannel.bindQueue(self.broadcastQueue, self.channel+'-exchange', '', {}, callback);
							});
						});
					} else {
						//we only need to assert the queue if the sending of messages is needed
						if (self.channel)
							self.amqpChannel.assertQueue(self.channel, {}, callback);
						else
							callback();
					}
				}
			});
		}
	], function(err) {
		if (err) {
			Application.logger.emergency('AMQP Queue: '+err.toString());
			process.exit(1);
		}
		self.amqpChannel.bindQueue(self.broadcastQueue || self.channel, 'amq.fanout', '', {}, function(err) {
			if (err) {
				Application.logger.error('Failed to bind AMQP queue to amq.fanout');
				self.failedBind = true;
			}

			if(typeof self.onReadyFunc == 'function') {
				Application.logger.info('Connected to AMQP Messaging Queue');
				self.onReadyFunc();
			}
		});
	});
};

AMQPClient.prototype = Object.create(MessagingClient.prototype);

AMQPClient.prototype.onMessage = function(callback) {
	var fromWhere = this.broadcast ? this.broadcastQueue : this.channel;

	this.amqpChannel.consume(fromWhere, function(message) {
		if (message !== null) {
			lz4.decompress(message.content, function(data) {
				callback(data.toString());
			});
		}
	}, {noAck: true});
};

AMQPClient.prototype.send = function(messages, channel, callback) {
	var self = this;

	if (this.assertedQueues[channel]) {
		async.each(messages, function(message, c) {
			lz4.compress(message, function(compressed) {
				self.amqpChannel.sendToQueue(channel, compressed);
				c();
			});
		}, callback);
	} else {
		this.amqpChannel.checkQueue(channel, function(err) {
			if (err) return callback(err);

			self.assertedQueues[channel] = true;

			async.each(messages, function(message, c) {
				lz4.compress(message, function(compressed) {
					self.amqpChannel.sendToQueue(channel, compressed);
					c();
				});
			}, callback);
		});
	}
};

AMQPClient.prototype.sendSystemMessages = function(to, action, messages, callback) {
	if (this.failedBind)
		return callback();

	var self = this;

	async.each(messages, function(message, c) {
		var messagePayload = {
			_systemMessage: true,
			to: to,
			action: action,
			content: message
		};

		lz4.compress(JSON.stringify(messagePayload), function(compressed) {
			self.amqpChannel.publish('amq.fanout', '', compressed);
			c();
		});
	}, callback);
};

AMQPClient.prototype.publish = function(messages, channel, callback) {
	var self = this;

	if (this.assertedQueues[channel+'-exchange']) {
		async.each(messages, function(message, c) {
			lz4.compress(message, function(compressed) {
				self.amqpChannel.publish(channel+'-exchange', '', compressed);
				c();
			});
		}, callback);
	} else {
		this.amqpChannel.assertExchange(channel+'-exchange', 'fanout', {}, function(err) {
			if (err) return callback(err);

			self.assertedQueues[channel+'-exchange'] = true;

			async.each(messages, function(message, c) {
				lz4.compress(message, function(compressed) {
					self.amqpChannel.publish(channel+'-exchange', '', compressed);
					c();
				});
			}, callback);
		});
	}
};

AMQPClient.prototype.shutdown = function(callback) {
	this.amqpChannel.close(callback);
};

module.exports = AMQPClient;
34
