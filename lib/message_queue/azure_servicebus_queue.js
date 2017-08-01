let MessagingClient = require('./messaging_client');
let azure = require('azure');
let async = require('async');
let Services = require('../Services');
class AzureServiceBus extends MessagingClient {
	constructor(config, name, channel) {
		super(config, name, channel);

		let envletiables = {
			TP_AZURESB_CONNECTION_STRING: process.env.TP_AZURESB_CONNECTION_STRING
		};

		if (channel) {
			envletiables.TP_AZURESB_MSG_POLLING = process.env.TP_AZURESB_MSG_POLLING;
		}

		let validEnvletiables = true;

		for(let letName in envletiables) {
			if (envletiables[letName] === undefined) {
				Services.logger.notice(`Missing environment letiable "${letName}". Trying configuration file.`);

				if (!this.config || !Object.getOwnPropertyNames(this.config).length) {
					Services.logger.emergency('Configuration file is missing configuration for Azure ServiceBus ' +
																				'messaging client.');
					process.exit(-1);
				}

				validEnvletiables = false;
				break;
			}
		}

		if (validEnvletiables) {
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
			(callback) => {
				if (channel) {
					this.connectionClient.getSubscription(channel, name, err => {
						if (err && err.statusCode == 404) {
							this.connectionClient.createSubscription(channel, name, err => {
								if (err) return callback(err);
								this.isSubscribed = true;
								callback();
							});
						} else if (err) {
							console.log(err);
							Services.logger.error(`Failed connecting to Azure ServiceBus (${err.toString()}). Reconnecting... `);
							setTimeout(() => {
								Connect(callback);
							}, 1000);
						} else {
							this.isSubscribed = true;
							callback();
						}
					});
				} else
					callback();
			}
		], err => {
			if (err) {
				console.log(err);
				console.log('Aborting...'.red);
				process.exit(-1);
			} else {
				if(typeof this.onReadyFunc == 'function') {
					Services.logger.info('Connected to Azure ServiceBus Messaging Queue');
					this.onReadyFunc();
				}
			}
		});
	}

	send(messages, channel, callback) {
		async.each(messages, (message, c) => {
			this.connectionClient.sendTopicMessage(channel, message, c);
		}, callback);
	}


	onMessage(callback) {
		if (this.isSubscribed) {
			setInterval(() => {
				this.connectionClient.receiveSubscriptionMessage(this.subscription, this.name, {timeoutIntervalInS: 30}, (err, serverMessage) => {
					if (err && err == 'No messages to receive') {
						return ;
					} else if (err) {
						Services.logger.error(`Error receiving Subscription Message from Azure ServiceBus (${err.toString()})`);
					} else {
						callback(serverMessage.body);
					}
				});
			}, this.config.polling_interval < 50 ? 50 : this.config.polling_interval);
		}
	}

	shutdown(callback) {
		callback();
	}
}

AzureServiceBus.publish = AzureServiceBus.send;


module.exports = AzureServiceBus;
