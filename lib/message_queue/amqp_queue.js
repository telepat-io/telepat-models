/**
 *
 * @type {MessagingClient|exports|module.exports}
 */
let MessagingClient = require('./messaging_client');
let amqplib = require('amqplib/callback_api');
let async = require('async');
let Services = require('../Services');
let lz4 = require('../../utils/utils').lz4;

class AMQPClient extends MessagingClient {
	constructor(config, name, channel) {
		super(config, name, channel);

		this.config = config;
		this.amqpChannel = null;
		this.broadcastQueue = null;
		this.assertedQueues = {};

		async.series([
			(callback) => {
				amqplib.connect(`amqp://${this.config.user}:${this.config.password}@${this.config.host}`, (err, conn) => {
					if (err) {
						Services.logger.error(`Failed connecting to AMQP messaging queue (${err.toString()}). Retrying... `);
						setTimeout(() => {
							TryConnecting(callback);
						}, 1000);
					} else {
						this.connectionClient = conn;
						callback();
					}
				});
			},
			(callback) => {
				this.connectionClient.createChannel((err, ch) => {
					if (err) {
						Services.logger.error(`Failed creating channel on the AMQP messaging queue (${err.toString()}). Retrying... `);
						setTimeout(() => {
							TryChannel(callback);
						}, 1000);
					} else {
						this.amqpChannel = ch;
						//create queue or exchange if it doesnt exist; used for consumers
						if (this.broadcast) {
							this.amqpChannel.assertExchange(`${this.channel}-exchange`, 'fanout', {}, err => {
								if (err) return callback(err);
								this.amqpChannel.assertQueue(this.name, {durable: false, autoDelete: true}, (err1, result) => {
									if (err1) return callback(err1);

									this.broadcastQueue = result.queue;
									this.amqpChannel.bindQueue(this.broadcastQueue, `${this.channel}-exchange`, '', {}, callback);
								});
							});
						} else {
							//we only need to assert the queue if the sending of messages is needed
							if (this.channel)
								this.amqpChannel.assertQueue(this.channel, {}, callback);
							else
								callback();
						}
					}
				});
			}
		], err => {
			if (err) {
				Services.logger.emergency(`AMQP Queue: ${err.toString()}`);
				process.exit(1);
			}
			this.amqpChannel.bindQueue(this.broadcastQueue || this.channel, 'amq.fanout', '', {}, err => {
				if (err) {
					Services.logger.error('Failed to bind AMQP queue to amq.fanout');
					this.failedBind = true;
				}
				if(typeof this.onReadyFunc == 'function') {
					Services.logger.info('Connected to AMQP Messaging Queue');
					this.onReadyFunc();
				}
			});
		});
	}

	onMessage(callback) {
		let fromWhere = this.broadcast ? this.broadcastQueue : this.channel;

		this.amqpChannel.consume(fromWhere, message => {
			if (message) {				
				lz4.decompress(message.content, data => {
					let parsedData = JSON.parse(data.toString());

					if(!parsedData._systemMessage) {
						callback(parsedData);
					}
					else {
						this.systemMessageFunc(parsedData, callback);
					}
				});
			}
		}, {noAck: true});
	}

	send(messages, channel, callback) {
		if (this.assertedQueues[channel]) {
			async.each(messages, (message, c) => {
				lz4.compress(message, compressed => {
					this.amqpChannel.sendToQueue(channel, compressed);
					c();
				});
			}, callback);
		} else {
			this.amqpChannel.checkQueue(channel, err => {
				if (err) return callback(err);

				this.assertedQueues[channel] = true;

				async.each(messages, (message, c) => {
					lz4.compress(message, compressed => {
						this.amqpChannel.sendToQueue(channel, compressed);
						c();
					});
				}, callback);
			});
		}
	}

	sendSystemMessages(to, action, messages, callback) {
		if (this.failedBind)
			return callback();

		async.each(messages, (message, c) => {
			let messagePayload = {
				_systemMessage: true,
				to,
				action,
				content: message
			};

			lz4.compress(JSON.stringify(messagePayload), compressed => {
				this.amqpChannel.publish('amq.fanout', '', compressed);
				c();
			});
		}, callback);
	}

	publish(messages, channel, callback) {

		if (this.assertedQueues[`${channel}-exchange`]) {
			async.each(messages, (message, c) => {
				lz4.compress(message, compressed => {
					this.amqpChannel.publish(`${channel}-exchange`, '', compressed);
					c();
				});
			}, callback);
		} else {
			this.amqpChannel.assertExchange(`${channel}-exchange`, 'fanout', {}, err => {
				if (err) return callback(err);

				this.assertedQueues[`${channel}-exchange`] = true;

				async.each(messages, (message, c) => {
					lz4.compress(message, compressed => {
						this.amqpChannel.publish(`${channel}-exchange`, '', compressed);
						c();
					});
				}, callback);
			});
		}
	}

	shutdown(callback) {
		this.amqpChannel.close(callback);
	}
}
AMQPClient.publish = AMQPClient.send;

module.exports = AMQPClient;