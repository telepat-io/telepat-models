'use strict';

let Services = new Proxy({
	datasource: null,
	logger: null,
	messagingClient: null,
	redisClient: null,
}, {
		get: (object, prop) => {
			if (!object[prop]) {
				return object.datasource.dataStorage[prop];
			}
			return object[prop];
		}
	});

module.exports = Services;