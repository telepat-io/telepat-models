var MessagingClient = require('./messaging_client');
var kafka = require('kafka-node');
var async = require('async');

var KafkaClient = function(config, name, channel){
	MessagingClient.call(this, config, name, channel);

	this.name = name;
	var self = this;

	var envVariables = {
		TP_KFK_HOST: process.env.TP_KFK_HOST,
		TP_KFK_PORT: process.env.TP_KFK_PORT
	};
	var validEnvVariables = true;

	for(var varName in envVariables) {
		if (envVariables[varName] === undefined) {
			console.log('Missing'.yellow+' environment variable "'+varName+'". Trying configuration file.');

			if (!config || !Object.getOwnPropertyNames(config).length) {
				throw new Error('Configuration file is missing configuration for Kafka messaging client.');
			}

			validEnvVariables = false;
			break;
		}
	}

	if (validEnvVariables) {
		config = {
			host: process.env.TP_KFK_HOST,
			port: process.env.TP_KFK_PORT
		};
	}

	async.series([
		function(callback) {
			self.connectionClient = kafka.Client(config.host+':'+config.port+'/', self.name);
			self.connectionClient.on('ready', function() {
				console.log('Client connected to Zookeeper & Kafka Messaing Client.'.green);
				callback();
			});
			self.connectionClient.on('error', function() {
				console.log('Kafka broker not available.'.red+' Trying to reconnect.');
			});
		},
		function(callback) {
			if (channel) {
				self.kafkaConsumer = new kafka.HighLevelConsumer(self.connectionClient, [{topic: channel}], {groupId: channel});
				self.kafkaConsumer.on('error', function() {});
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

KafkaClient.prototype = Object.create(MessagingClient.prototype);

KafkaClient.prototype.send = function(messages, channel, callback) {
	this.kafkaProducer.send([{
		topic: channel,
		messages: messages
	}], function(err) {
		callback(err);
	});
};

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
