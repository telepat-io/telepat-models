var MessagingClient = require('./messaging_client');
var azure = require('azure');
var async = require('async');
require('colors');

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
			console.log('Missing'.yellow+' environment variable "'+varName+'". Trying configuration file.');

			if (!config || !Object.getOwnPropertyNames(config).length) {
				throw new Error('Configuration file is missing configuration for Azure ServiceBus messaging client.');
			}

			validEnvVariables = false;
			break;
		}
	}

	if (validEnvVariables) {
		config = {
			connection_string: process.env.TP_AZURESB_CONNECTION_STRING,
			polling_interval: process.env.TP_AZURESB_MSG_POLLING
		};
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
						console.log('Failed connecting'.red+' to Azure ServiceBus. Reconnecting... ');
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

AzureServiceBus.prototype.onMessage = function(callback) {
	var self = this;

	if (this.isSubscribed) {
		setInterval(function() {
			self.connectionClient.receiveSubscriptionMessage(self.subscription, self.name, {timeoutIntervalInS: 30}, function(err, serverMessage) {
				if (err && err == 'No messages to receive') {
					return ;
				} else if (err) {
					console.log('Error'.red+' receiving Subscription Message from Azure ServiceBus');
					console.log(err);
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
