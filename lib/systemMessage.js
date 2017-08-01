let Application = require('./Application.js');

let SystemMessageProcessor = {
	process(message) {
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
	updateApp(appId, app) {
		Application.loadedAppModels[appId] = app;
	},
	deleteApp(appId) {
		delete Application.loadedAppModels[appId];
	}
};

SystemMessageProcessor.identity = null;


module.exports = SystemMessageProcessor;
