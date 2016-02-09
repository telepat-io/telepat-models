var fs = require('fs');

module.exports.Application = require('./lib/Application');
module.exports.Application.load();

module.exports.Context = require('./lib/Context');
module.exports.Context.load();

module.exports.Model = require('./lib/Model');

module.exports.Subscription = require('./lib/Subscription');

module.exports.Admin = require('./lib/Admin');
module.exports.Admin.load();

module.exports.User = require('./lib/User');
module.exports.User.load();

module.exports.utils = require('./utils/utils');

module.exports.Channel = require('./lib/Channel');
module.exports.Delta = require('./lib/Delta');

module.exports.ProfilingContext = require('./utils/profiling');

module.exports.TelepatError = require('./lib/TelepatError');

module.exports.Datasource = require('./lib/database/datasource');
module.exports.ElasticSearch = require('./lib/database/elasticsearch_adapter');

module.exports.TelepatLogger = require('./lib/logger/logger');

fs.readdirSync(__dirname+'/lib/message_queue').forEach(function(filename) {
	var filenameParts = filename.split('_');

	if (filenameParts.pop() == 'queue.js') {
		module.exports[filenameParts.join('_')] = require('./lib/message_queue/'+filename);
	}
});
