let SystemMessageProcessor = require('./SystemMessageProcessor');
'use strict';
let Services = new Proxy({
	datasource:null,
	logger:null, 
	messaginClient: null,
	redisClient: null,
	SystemMessageProcessor
},{
	get: (object, prop) => {
		if(typeof object[prop] === 'undefined') {
			return object.datasource.dataStorage[prop];
		}
		return object[prop];
	}
});

module.exports = Services;