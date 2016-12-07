var common = require('./common');
var expect = common.expect;
var assert = common.assert;
var es = require('elasticsearch');
var clone = require('clone');
var esConnection = new es.Client(clone(common.config.ElasticSearch1));
var Application = require('../lib/Application');
var TelepatLogger = require('../lib/logger/logger');

Application.logger = new TelepatLogger({
	type: 'Console',
	name: 'telepat-models-tests',
	settings: {level: 'debug'}
});

var tests = [
	{
		name: 'ElasticSearch',
		path: 'database/elasticsearch/elasticsearch.js',
		cleanup: function(callback) {
			esConnection.indices.delete({index: common.config.ElasticSearch1.index}, function(err) {
				if (err)
					console.log(err);
				callback();
			});
		},
		before: function(callback) {
			esConnection.indices.exists({index: common.config.ElasticSearch1.index}, function(err, exists) {
				if (!exists) {
					esConnection.indices.create({index: common.config.ElasticSearch1.index}, function(err) {
						if (err)
							console.trace(err);

						callback();
					});
				} else {
					callback();
				}
			});
		}
	}
];

describe('Telepat Models', function() {
	tests.forEach(function(t, i) {
		describe((i+1) + '. ' + t.name, function() {
			try {
				if (t.before && t.before instanceof Function) {
					before(function(done) {
						setTimeout(function() {
							t.before(done);
						}, 1000);
					});
				}

				this.timeout(10000);

				require(__dirname + '/' + t.path);

				if (t.cleanup && t.cleanup instanceof Function) {
					after(t.cleanup);
				}
			} catch (e) {
				if (e.code == 'MODULE_NOT_FOUND') {
					console.log('Test not found: ' + t.path);
					process.exit(1);
				} else
					throw e;
			}
		});
	});
});
