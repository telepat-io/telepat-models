let MessagingClient = require('./messaging_client');
let kafka = require('kafka-node');
let async = require('async');
let Services = require('../Services');

class KafkaClient extends MessagingClient {
	constructor(config, name, channel) {
		super(config, name, channel);

		this.config = config;
		async.series([
			(callback) => {
				this.connectionClient = kafka.Client(this.config.host+':'+this.config.port+'/', this.name);
				this.connectionClient.on('ready', () => {
					Services.logger.info('Client connected to Zookeeper & Kafka Messaging Client.');
					callback();
				});
				this.connectionClient.on('error', () => {
					Services.logger.error('Kafka broker not available. Trying to reconnect.');
				});
			},
			(callback) => {
				let groupId = this.broadcast ? this.name : channel;
				if (channel) {
					this.kafkaConsumer = new kafka.HighLevelConsumer(this.connectionClient, [{topic: channel}], {groupId: groupId});
					this.kafkaConsumer.on('error', (err) => {
						console.log(err);
					});
				}
				callback();
			},
			 (callback) => {
				this.kafkaProducer = new kafka.HighLevelProducer(this.connectionClient);
				this.kafkaProducer.on('error',  () => {});
				callback();
			}
		],(err) => {
			if (err) {
				Services.logger.emergency('Kafka Queue: '+err.toString());
				process.exit(-1);
			} else {
				if(typeof this.onReadyFunc == 'function') {
					this.onReadyFunc();
				}
			}
		});
	}
	send(messages, channel, callback) {
		this.kafkaProducer.send([{
			topic: channel,
			messages: messages
		}], (err) => {
			callback(err);
		});
	}
	onMessage(callback) {
		if (this.kafkaConsumer)	{
			this.kafkaConsumer.on('message', (message) => {
				callback(message.value);
			});
		}
	}

	shutdown(callback) {
		this.connectionClient.close(callback);
	}
	
	consumerOn(event, callback) {
		if(this.kafkaConsumer) {
			this.kafkaConsumer.on(event, callback);
		}
	}

	producerOn(event, callback) {
		this.kafkaProducer.on(event, callback);
	}
}

module.exports = KafkaClient;