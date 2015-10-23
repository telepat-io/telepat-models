var MessagingClient = require('./messaging_client');
var kafka = require('kafka-node');
var async = require('async');

var KafkaClient = function(config, name, channel){
	MessagingClient.call(this, config, name, channel);

	var self = this;

	var envVariables = {
		TP_KFK_HOST: process.env.TP_KFK_HOST,
		TP_KFK_PORT: process.env.TP_KFK_PORT
	};
	var validEnvVariables = true;

	for(var varName in envVariables) {
		if (envVariables[varName] === undefined) {
			Application.logger.notice('Missing environment variable "'+varName+'". Trying configuration file.');

			if (!this.config || !Object.getOwnPropertyNames(this.config).length) {
				Application.logger.emergency('Configuration file is missing configuration for Kafka messaging client.');
				process.exit(-1);
			}

			validEnvVariables = false;
			break;
		}
	}

	if (validEnvVariables) {
		this.config.host = process.env.TP_KFK_HOST;
		this.config.port = process.env.TP_KFK_PORT;
	}

	async.series([
		function(callback) {
			self.connectionClient = kafka.Client(self.config.host+':'+self.config.port+'/', self.name);
			self.connectionClient.on('ready', function() {
				Application.logger.info('Client connected to Zookeeper & Kafka Messaging Client.');
				callback();
			});
			self.connectionClient.on('error', function() {
				Application.logger.error('Kafka broker not available. Trying to reconnect.');
			});
		},
		function(callback) {
			var groupId = self.broadcast ? self.name : channel;
			if (channel) {
				self.kafkaConsumer = new kafka.HighLevelConsumer(self.connectionClient, [{topic: channel}], {groupId: groupId});
				self.kafkaConsumer.on('error', function(err) {
					console.log(err);
				});
			}
			callback();
		},
		function(callback) {
			self.kafkaProducer = new kafka.HighLevelProducer(self.connectionClient);
			self.kafkaProducer.on('error', function() {});
			callback();
		}
	], function(err) {
		if (err) {
			Application.logger.emergency('Kafka Queue: '+err.toString());
			process.exit(-1);
		} else {
			if(typeof self.onReadyFunc == 'function') {
				self.onReadyFunc();
			}
		}
	});
};

KafkaClient.prototype = Object.create(MessagingClient.prototype);

KafkaClient.prototype.send = function(messages, channel, callback) {
	this.kafkaProducer.send([{
		topic: channel,
		messages: messages
	}], function(err) {
		callback(err);
	});
};

KafkaClient.prototype.publish = KafkaClient.prototype.send;

KafkaClient.prototype.onMessage = function(callback) {
	if (this.kafkaConsumer)	{
		this.kafkaConsumer.on('message', function(message) {
			callback(message.value);
		});
	}
};

KafkaClient.prototype.shutdown = function(callback) {
	this.connectionClient.close(callback);
};

KafkaClient.prototype.consumerOn = function(event, callback) {
	if (this.kafkaConsumer)
		this.kafkaConsumer.on(event, callback);
};

KafkaClient.prototype.producerOn = function(event, callback) {
	this.kafkaProducer.on(event, callback);
};

module.exports = KafkaClient;
