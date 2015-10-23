var MessagingClient = require('./messaging_client');
var azure = require('azure');
var async = require('async');

var AzureServiceBus = function(config, name, channel){
	MessagingClient.call(this, config, name, channel);

	var self = this;

	var envVariables = {
		TP_AZURESB_CONNECTION_STRING: process.env.TP_AZURESB_CONNECTION_STRING
	};

	if (channel) {
		envVariables.TP_AZURESB_MSG_POLLING = process.env.TP_AZURESB_MSG_POLLING;
	}

	var validEnvVariables = true;

	for(var varName in envVariables) {
		if (envVariables[varName] === undefined) {
			Application.logger.notice('Missing environment variable "'+varName+'". Trying configuration file.');

			if (!this.config || !Object.getOwnPropertyNames(this.config).length) {
				Application.logger.emergency('Configuration file is missing configuration for Azure ServiceBus ' +
				'messaging client.');
				process.exit(-1);
			}

			validEnvVariables = false;
			break;
		}
	}

	if (validEnvVariables) {
		this.config.connection_string = process.env.TP_AZURESB_CONNECTION_STRING;
		this.config.polling_interval =process.env.TP_AZURESB_MSG_POLLING;
	}

	/**
	 *
	 * @type {ServiceBusService|*}
	 */
	this.connectionClient = azure.createServiceBusService(config.connection_string);
	this.isSubscribed = false;
	//this can be undefined if receiving messages from topics is not desired
	this.subscription = channel;

	async.series([
		function Connect(callback) {
			if (channel) {
				self.connectionClient.getSubscription(channel, name, function(err) {
					if (err && err.statusCode == 404) {
						self.connectionClient.createSubscription(channel, name, function(err) {
							if (err) return callback(err);
							self.isSubscribed = true;
							callback();
						});
					} else if (err) {
						console.log(err);
						Application.logger.error('Failed connecting to Azure ServiceBus ('+
							err.toString()+'). Reconnecting... ');
						setTimeout(function() {
							Connect(callback);
						}, 1000);
					} else {
						self.isSubscribed = true;
						callback()
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
				Application.logger.info('Connected to Azure ServiceBus Messaging Queue');
				self.onReadyFunc();
			}
		}
	});
};

AzureServiceBus.prototype = Object.create(MessagingClient.prototype);

AzureServiceBus.prototype.send = function(messages, channel, callback) {
	var self = this;
	async.each(messages, function(message, c) {
		self.connectionClient.sendTopicMessage(channel, message, c);
	}, callback);
};

AzureServiceBus.prototype.publish = AzureServiceBus.prototype.send;

AzureServiceBus.prototype.onMessage = function(callback) {
	var self = this;

	if (this.isSubscribed) {
		setInterval(function() {
			self.connectionClient.receiveSubscriptionMessage(self.subscription, self.name, {timeoutIntervalInS: 30}, function(err, serverMessage) {
				if (err && err == 'No messages to receive') {
					return ;
				} else if (err) {
					Application.logger.error('Error receiving Subscription Message from Azure ServiceBus ('+err.toString()+')');
				} else {
					callback(serverMessage.body);
				}
			});
		}, this.config.polling_interval < 50 ? 50 : this.config.polling_interval);
	}
};

AzureServiceBus.prototype.shutdown = function(callback) {
	callback();
};

module.exports = AzureServiceBus;
