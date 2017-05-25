const async = require('async');

const Application = require('./lib/Application'),
	ConfigurationManager = require('./lib/ConfigurationManager');

let config;

const init = callback => {
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
