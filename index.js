const async = require('async'),
	   redis = require('redis'),
	   fs = require('fs');
const Application = require('./lib/Application'),
	ConfigurationManager = require('./lib/ConfigurationManager'),
	Datasource = require('./lib/database/datasource'),
	TelepatLogger = require('./lib/logger/logger'),
	SystemMessageProcessor = require('./lib/systemMessage');
let config, logger, datasource;

let models = {
	ElasticSearch: require('./lib/database/elasticsearch_adapter')	
}

fs.readdirSync(__dirname+'/lib/message_queue').forEach(function(filename) {
	var filenameParts = filename.split('_');

	if (filenameParts.pop() == 'queue.js') {
		models[filenameParts.join('_')] = require('./lib/message_queue/'+filename);
	}
});


const init = (name, callback) => {
	let configManager = new ConfigurationManager('./config.spec.json', './config.json');
	async.series([
		seriesCallback => {
			configManager.load(err => {
				if (err) {
					return seriesCallback(err);
				}

				let testResult = configManager.test();

				if (testResult === true) {
					config = configManager.config;

					seriesCallback();
				} else {
					seriesCallback(testResult);
				}
			});
		},
		seriesCallback => {
			if (config.logger) {
				config.logger.name = name +(process.env.PORT || 3000);
				Application.logger = new TelepatLogger(config.logger);
			} else {
				Application.logger = new TelepatLogger({
					type: 'Console',
					name: name+(process.env.PORT || 3000),
					settings: {level: 'info'}
				});
			};
			let mainDatabase = config.main_database;
		
			if (!models[mainDatabase]) {
				Application.logger.emergency('Unable to load "' + mainDatabase + '" main database: not found. Aborting...');
				process.exit(2);
			}
			
			Application.datasource = new Datasource();
			Application.datasource.setMainDatabase(new models[mainDatabase](config[mainDatabase]));
			seriesCallback();
		},
		seriesCallback => {
			console.log('here');
			Application.datasource.dataStorage.onReady(function() {
				seriesCallback();
			});
		},
		seriesCallback => {
			if (Application.redisClient) {
				Application.redisClient = null;
			}
			let redisConf = config.redis;
			let retry_strategy = function(options) {
				if (options.error && (options.error.code === 'ETIMEDOUT' || options.error.code === 'ECONNREFUSED'))
					return 1000;

				Application.logger.error('Redis server connection lost "'+redisConf.host+'". Retrying...');
				// reconnect after
				return 3000;
			};

			Application.redisClient = redis.createClient({
				port: redisConf.port,
				host: redisConf.host,
				retry_strategy: retry_strategy
			});
			Application.redisClient.on('error', function(err) {
				Application.logger.error('Failed connecting to Redis "' + redisConf.host + '": ' +
					err.message + '. Retrying...');
			});
			Application.redisClient.on('ready', function() {
				Application.logger.info('Client connected to Redis.');
				seriesCallback();
			});
		}, 
		seriesCallback => {
			if (Application.redisCacheClient)	redis = require('redis');
				Application.redisCacheClient = null;

			let redisCacheConf = config.redisCache;
			let retry_strategy = function(options) {
				if (options.error && (options.error.code === 'ETIMEDOUT' || options.error.code === 'ECONNREFUSED'))
					return 1000;

				Application.logger.error('Redis cache server connection lost "'+redisCacheConf.host+'". Retrying...');

				// reconnect after
				return 3000;
			};

			Application.redisCacheClient = redis.createClient({
				port: redisCacheConf.port,
				host: redisCacheConf.host,
				retry_strategy: retry_strategy
			});
			Application.redisCacheClient.on('error', function(err) {
				Application.logger.error('Failed connecting to Redis Cache "' + redisCacheConf.host + '": ' +
					err.message + '. Retrying...');
			});
			Application.redisCacheClient.on('ready', function() {
				Application.logger.info('Client connected to Redis Cache.');
				seriesCallback();
			});
		},
		seriesCallback => {
			name = 'api';
			var messagingClient = config.message_queue;
			var clientConfiguration = config[messagingClient];
			
			if (!models[messagingClient]) {
				Application.logger.error('Unable to load "'+messagingClient+'" messaging queue: not found. ' +
				'Aborting...');
				process.exit(5);
			}

			clientConfiguration = clientConfiguration || {broadcast: false};
			/**
			 * @type {MessagingClient}
			 */
			Application.messagingClient = new models[messagingClient](clientConfiguration, 'telepat-'+name, name);
			Application.messagingClient.onReady(function() {

				Application.messagingClient.onMessage(function(message) {
					var parsedMessage = JSON.parse(message);
					SystemMessageProcessor.identity = name;
					if (parsedMessage._systemMessage) {
						Application.logger.debug('Got system message: "'+message+'"');
						SystemMessageProcessor.process(parsedMessage);
					}
				});
				seriesCallback();
			});
		}
		
	], callback);


};

const appsModule = new Proxy({
	new: Application.new,
	get: Application.get
}, {
	get: (object, prop) => {
		if (!config) {
			throw new Error('Not initialized'); // TODO: improve
		}

		if (typeof object[prop] === 'function') {
			return object[prop];
		}

		return object.get(prop);
	}
});


module.exports = {
	init,
	config,
	apps: appsModule
};
