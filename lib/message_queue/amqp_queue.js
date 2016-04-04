/**
 *
 * @type {MessagingClient|exports|module.exports}
 */
var MessagingClient = require('./messaging_client');
var amqplib = require('amqplib/callback_api');
var async = require('async');
var Application = require('../Application');

var AMQPClient = function(config, name, channel) {
	MessagingClient.call(this, config, name, channel);

	var self = this;

	var envVariables = {
		TP_AMQP_HOST: process.env.TP_AMQP_HOST,
		TP_AMQP_USER: process.env.TP_AMQP_USER,
		TP_AMQP_PASSWORD: process.env.TP_AMQP_PASSWORD
	};
	var validEnvVariables = true;

	for(var varName in envVariables) {
		if (envVariables[varName] === undefined) {
			Application.logger.notice('Missing environment variable "'+varName+'". Trying configuration file.');

			if (!this.config || !Object.getOwnPropertyNames(this.config).length) {
				Application.logger.emergency('Configuration file is missing configuration for AMQP messaging client.');
				process.exit(-1);
			}

			validEnvVariables = false;
			break;
		}
	}

	if (validEnvVariables) {
		this.config.host = process.env.TP_AMQP_HOST;
		this.config.user = process.env.TP_AMQP_USER;
		this.config.password = process.env.TP_AMQP_PASSWORD;
	}

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
							self.amqpChannel.assertQueue(self.name, {exclusive: true, autoDelete: true}, function(err1, result) {
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
		if(typeof self.onReadyFunc == 'function') {
			Application.logger.info('Connected to AMQP Messaging Queue');
			self.onReadyFunc();
		}
	});
};

AMQPClient.prototype = Object.create(MessagingClient.prototype);

AMQPClient.prototype.onMessage = function(callback) {
	var fromWhere = this.broadcast ? this.broadcastQueue : this.channel;

	this.amqpChannel.consume(fromWhere, function(message) {
		if (message !== null) {
			callback(message.content.toString());
		}
	}, {noAck: true});
};

AMQPClient.prototype.send = function(messages, channel, callback) {
	var self = this;

	if (this.assertedQueues[channel]) {
		async.each(messages, function(message, c) {
			self.amqpChannel.sendToQueue(channel, new Buffer(message));
			c();
		}, callback);
	} else {
		this.amqpChannel.assertQueue(channel, {}, function(err) {
			if (err) return callback(err);

			self.assertedQueues[channel] = true;

			async.each(messages, function(message, c) {
				self.amqpChannel.sendToQueue(channel, new Buffer(message));
				c();
			}, callback);
		});
	}
};

AMQPClient.prototype.publish = function(messages, channel, callback) {
	var self = this;

	if (this.assertedQueues[channel+'-exchange']) {
		async.each(messages, function(message, c) {
			self.amqpChannel.publish(channel+'-exchange', '', new Buffer(message));
			c();
		}, callback);
	} else {
		this.amqpChannel.assertExchange(channel+'-exchange', 'fanout', {}, function(err) {
			if (err) return callback(err);

			self.assertedQueues[channel+'-exchange'] = true;

			async.each(messages, function(message, c) {
				self.amqpChannel.publish(channel+'-exchange', '', new Buffer(message));
				c();
			}, callback);
		});
	}
};

AMQPClient.prototype.shutdown = function(callback) {
	this.amqpChannel.close(callback);
};

module.exports = AMQPClient;
