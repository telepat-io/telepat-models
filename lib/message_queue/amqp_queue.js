/**
 *
 * @type {MessagingClient|exports|module.exports}
 */
var MessagingClient = require('./messaging_client');
var amqplib = require('amqplib');
var async = require('async');
require('colors');

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
			console.log('Missing'.yellow+' environment variable "'+varName+'". Trying configuration file.');

			if (!config || !Object.getOwnPropertyNames(config).length) {
				throw new Error('Configuration file is missing configuration for AMQP messaging client.');
			}

			validEnvVariables = false;
			break;
		}
	}

	if (validEnvVariables) {
		config = {
			host: process.env.TP_AMQP_HOST,
			user: process.env.TP_AMQP_USER,
			password: process.env.TP_AMQP_PASSWORD
		};
	}

	this.amqpChannel = null;
	//this.producerChannel = null;

	var open = null;

	async.series([
		function TryConnecting(callback) {
			open = amqplib.connect('amqp://'+config.user+':'+config.password+'@'+config.host);
			open.then(function(conn) {
				self.connectionClient = conn;
				console.log("connected");
				callback();
			})
		},
		function TryChannel(callback) {
			if (channel) {
				self.connectionClient.createChannel(function(err, ch) {
					if (err) {
						setTimeout(function() {
							console.log(err);
							console.log('Failed creating consumer channel'.red+' on AMQP server at '+
							config.host+'. Trying to reconnect...');
							TryChannel(callback);
						}, 1000);
					} else {
						self.amqpChannel = ch;
						callback();
					}
				});
			} else
				callback();
		}
	], function(err) {
		if (err) {
			console.log(err);
			console.log('Aborting...'.red);
			process.exit(-1);
		} else {
			if(typeof self.onReadyFunc == 'function') {
				console.log('Connected to'.green+' AMQP Messaging Queue');
				self.onReadyFunc();
			}
		}
	});
};

AMQPClient.prototype = Object.create(MessagingClient.prototype);

AMQPClient.prototype.onMessage = function(callback) {
	if (this.amqpChannel)	{
		this.amqpChannel.assertQueue(this.channel);
		this.amqpChannel.consume(this.channel, function(message) {
			if (message !== null) {
				callback(message.content.toString());
			}
		}, {noAck: true});
	}
};

AMQPClient.prototype.send = function(messages, channel, callback) {
	var self = this;
	this.amqpChannel.assertQueue(channel);

	async.each(messages, function(message, c) {
		self.amqpChannel.sendToQueue(channel, new Buffer(message), c);
	}, callback);
};

AMQPClient.prototype.shutdown = function(callback) {
	callback();
};

module.exports = AMQPClient;
