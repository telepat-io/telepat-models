var Models = require('telepat-models');

var SystemMessageProcessor = {
	process: function(message) {
		if (message.to == '_all' || message.to == SystemMessageProcessor.identity) {
			switch(message.action) {
				case 'update_app': {
					SystemMessageProcessor.updateApp(message.content.appId, message.content.appObject);

					break;
				}
				case 'delete_app': {
					SystemMessageProcessor.deleteApp(message.content.id);
				}
			}
		}
	},
	updateApp: function(appId, app) {
		Models.Application.loadedAppModels[appId] = app;
	},
	deleteApp: function(appId) {
		delete Models.Application.loadedAppModels[appId];
	}
};

SystemMessageProcessor.identity = null;

module.exports = SystemMessageProcessor;
