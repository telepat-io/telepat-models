const async = require('async'),
	   redis = require('redis'),
	   fs = require('fs');
const Application = require('./lib/Application'),
	ConfigurationManager = require('./lib/ConfigurationManager'),
	Datasource = require('./lib/database/datasource'),
	TelepatLogger = require('./lib/logger/logger'),
	Services = require('./lib/Services'),
	SystemMessageProcessor = require('./lib/systemMessage'),
	FilterBuilder = require('./utils/filterbuilder').FilterBuilder,
	Model = require('./lib/Model');
let config;

let acceptedServices = {
	ElasticSearch: require('./lib/database/elasticsearch_adapter')	
}

fs.readdirSync(__dirname+'/lib/message_queue').forEach((filename) => {
	let filenameParts = filename.split('_');
	if (filenameParts.pop() == 'queue.js') {
		acceptedServices[filenameParts.join('_')] = require('./lib/message_queue/'+filename);
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
				Services.logger = new TelepatLogger(config.logger);
			} else {
				Services.logger = new TelepatLogger({
					type: 'Console',
					name: name+(process.env.PORT || 3000),
					settings: {level: 'info'}
				});
			}
			let mainDatabase = config.main_database;
		
			if (!acceptedServices[mainDatabase]) {
				Services.logger.emergency('Unable to load "' + mainDatabase + '" main database: not found. Aborting...');
				process.exit(2);
			}
			
			Services.datasource = new Datasource();
			Services.datasource.setMainDatabase(new acceptedServices[mainDatabase](config[mainDatabase]));
			seriesCallback();
		},
		seriesCallback => {
			Services.datasource.dataStorage.onReady(() => {
				seriesCallback();
			});
		},
		seriesCallback => {
			if (Services.redisClient) {
				Services.redisClient = null;
			}
			let redisConf = config.redis;
			let retry_strategy = (options) => {
				if (options.error && (options.error.code === 'ETIMEDOUT' || options.error.code === 'ECONNREFUSED'))
					return 1000;

				Services.logger.error('Redis server connection lost "'+redisConf.host+'". Retrying...');
				// reconnect after
				return 3000;
			};

			Services.redisClient = redis.createClient({
				port: redisConf.port,
				host: redisConf.host,
				retry_strategy: retry_strategy
			});
			Services.redisClient.on('error', (err) => {
				Services.logger.error('Failed connecting to Redis "' + redisConf.host + '": ' +
					err.message + '. Retrying...');
			});
			Services.redisClient.on('ready', () => {
				Services.logger.info('Client connected to Redis.');
				seriesCallback();
			});
		}, 
		seriesCallback => {
			if (Services.redisCacheClient) {
				Services.redisCacheClient = null;
			}

			let redisCacheConf = config.redisCache;
			let retry_strategy = (options) => {
				if (options.error && (options.error.code === 'ETIMEDOUT' || options.error.code === 'ECONNREFUSED'))
					return 1000;

				Services.logger.error('Redis cache server connection lost "'+redisCacheConf.host+'". Retrying...');

				// reconnect after
				return 3000;
			};

			Services.redisCacheClient = redis.createClient({
				port: redisCacheConf.port,
				host: redisCacheConf.host,
				retry_strategy: retry_strategy
			});
			Services.redisCacheClient.on('error', (err) => {
				Services.logger.error('Failed connecting to Redis Cache "' + redisCacheConf.host + '": ' +
					err.message + '. Retrying...');
			});
			Services.redisCacheClient.on('ready', () => {
				Services.logger.info('Client connected to Redis Cache.');
				seriesCallback();
			});
		},
		seriesCallback => {
			name = 'api';
			let messagingClient = config.message_queue;
			let clientConfiguration = config[messagingClient];
			
			if (!acceptedServices[messagingClient]) {
				Services.logger.error('Unable to load "'+messagingClient+'" messaging queue: not found. ' +
				'Aborting...');
				process.exit(5);
			}

			clientConfiguration = clientConfiguration || {broadcast: false};
			/**
			 * @type {MessagingClient}
			 */
			Services.messagingClient = new acceptedServices[messagingClient](clientConfiguration, 'telepat-'+name, name);
			Services.messagingClient.onReady(() => {
				Services.messagingClient.onMessage((message) => {
					let parsedMessage = JSON.parse(message);
					SystemMessageProcessor.identity = name;
					if (parsedMessage._systemMessage) {
						Services.logger.debug('Got system message: "'+message+'"');
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
	get: Application.get,
	getAll: Application.getAll,
	models: Model
}, {
	get: (object, prop) => {
		if (!config) {
			throw new Error('Not initialized'); // TODO: improve
		}
		if (typeof object[prop] === 'function') {
			return object[prop];
		}
		return object.get(prop);
	},
});

module.exports =  {
	init,
	config,
	apps: appsModule,
	db: Services
};