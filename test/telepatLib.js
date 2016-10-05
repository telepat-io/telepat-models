var common = require("./common");

var tests = [
	{
		name: "ElasticSearch",
		path: "./database/ElasticSearch.js",
		cleanup: function(callback) {
			//TODO: remove index
		}
	}
];

describe("Telepat Models", function() {
	tests.forEach(function(t, i) {
		describe((i+1) + '. ' + t.name, function() {
			try {
				require(t.path);
				if (t.cleanup && t.cleanup instanceof Function) {
					after(t.cleanup);
				}
			} catch (e) {
				if (e.code == "MODULE_NOT_FOUND") {
					console.log("Test not found: " + t.path);
					process.exit(1);
				}
			}
		});
	});
});
