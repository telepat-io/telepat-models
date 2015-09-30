var MessagingClient = require('./messaging_client');
var kafka = require('kafka-node');

var KafkaClient = function(config, name, channel){
	MessagingClient.call(this, config, name, channel);

	this.name = name;

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

	this.connectionClient = kafka.Client(config.host+':'+config.port+'/', this.name);

	if (channel) {
		this.kafkaConsumer = new kafka.HighLevelConsumer(this.connectionClient, [{topic: channel}], {groupId: channel});
		this.kafkaConsumer.on('error', function() {});
	}

	this.kafkaProducer = new kafka.HighLevelProducer(this.connectionClient);
	this.kafkaProducer.on('error', function() {});
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
	if (this.kafkaConsumer)
		this.kafkaConsumer.on('message', callback);
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
