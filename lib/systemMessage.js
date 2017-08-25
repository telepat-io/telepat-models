let Application = require('./Application.js');

let SystemMessageProcessor = {
	process(message) {		
		if (message.to == '_all' || message.to == SystemMessageProcessor.identity) {
			switch (message.action) {
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
		if (!(app instanceof Application)) {
			if (app.properties) {
				app = app.properties;
			}
			app = new Application(app);
		}

		Application.apps[appId] = app;
	},
	deleteApp(appId) {
		delete Application.apps[appId];
	}
};

SystemMessageProcessor.identity = null;


module.exports = SystemMessageProcessor;
