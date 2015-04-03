var fs = require('fs');

module.exports.Application = require('./lib/Application');
module.exports.Application.load();
module.exports.Context = require('./lib/Context');
module.exports.Context.load();
module.exports.Model = require('./lib/Model');
module.exports.Subscription = require('./lib/Subscription');
module.exports.Admin = require('./lib/Admin');
module.exports.Admin.load();
module.exports.getModels = function() {
	var models = {};
	var files = fs.readdirSync('./node_modules/octopus-models-api/models');

	for (var f in files) {
		if (files.hasOwnProperty(f)) {
			var name = files[f].replace('.json', '');
			models[name] = require('./models/'+files[f]);
		}
	}

	return models;
};
