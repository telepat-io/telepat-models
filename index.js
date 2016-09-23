var fs = require('fs');

module.exports.Application = require('./lib/Application');

module.exports.Context = require('./lib/Context');

module.exports.Model = require('./lib/Model');

module.exports.Subscription = require('./lib/Subscription');

module.exports.Admin = require('./lib/Admin');

module.exports.User = require('./lib/User');

module.exports.utils = require('./utils/utils');
module.exports.Builders = require('./utils/filterbuilder');

module.exports.Channel = require('./lib/Channel');
module.exports.Delta = require('./lib/Delta');

module.exports.ProfilingContext = require('./utils/profiling');

module.exports.TelepatError = require('./lib/TelepatError');

module.exports.Datasource = require('./lib/database/datasource');
module.exports.ElasticSearch = require('./lib/database/elasticsearch_adapter');

module.exports.TelepatLogger = require('./lib/logger/logger');

module.exports.TelepatIndexedList = require('./lib/TelepatIndexedLists');

module.exports.ConfigurationManager = require('./lib/ConfigurationManager');

module.exports.SystemMessageProcessor = require('./lib/systemMessage');

fs.readdirSync(__dirname+'/lib/message_queue').forEach(function(filename) {
	var filenameParts = filename.split('_');

	if (filenameParts.pop() == 'queue.js') {
		module.exports[filenameParts.join('_')] = require('./lib/message_queue/'+filename);
	}
});
