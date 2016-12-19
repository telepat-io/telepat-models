var common = require('../../common');
var chai = require('chai');
var expect = chai.expect;
var clone = require('clone');
chai.should();
chai.use(require('chai-things'));

var sinon = require('sinon');
var clone = require('clone');
var esAdapter = require('../../../lib/database/elasticsearch_adapter');
var TelepatError = require('../../../lib/TelepatError');
var TelepatLogger = require('../../../lib/logger/logger');

module.exports = function Constructor(callback) {
	describe('ElasticSearchDB.constructor', function() {
		after(function(done) {
			afterTest(done, callback);
		});

		it('Should fail because configuration parameter is missing or not valid param', function(done) {
			try {
				var client1 = new esAdapter();
			} catch(e) {
				expect(e).to.be.instanceof(TelepatError);
				expect(e.code).to.equal('002');
			}

			try {
				client1 = new esAdapter({});
			} catch(e) {
				expect(e).to.be.instanceof(TelepatError);
				expect(e.code).to.equal('002');
			}

			afterSubTest(done);
		});

		it('Should connect to a real server with the correct configuration param ', function(done) {
			var esConfig = clone(common.config.ElasticSearch1);
			var infoLogSpy = sinon.spy(TelepatLogger.prototype, 'info');

			try {
				var client = new esAdapter(esConfig);
			} catch (e) {
				expect(e).to.be.undefined;
			}
			expect(client.config.host).to.be.equal(esConfig.host);
			expect(client.config.hosts).to.be.undefined;

			client.onReady(function() {
				infoLogSpy.restore();
				sinon.assert.calledOnce(infoLogSpy);
				sinon.assert.calledWith(infoLogSpy, 'Connected to ElasticSearch MainDatabase');

				afterSubTest(done);
			});
		});

		it('Shouldn\'t connect to a server because host timed out', function(done) {
			var esConfig = clone(common.config.ElasticSearch1);
			esConfig.host = '127.0.0.2:9200';
			esConfig.log = false;
			var infoLogSpy = sinon.spy(TelepatLogger.prototype, 'info');
			var errorLogSpy = sinon.spy(TelepatLogger.prototype, 'error');

			try {
				var client = new esAdapter(esConfig);
			} catch (e) {
				expect(e).to.be.undefined;
			}

			expect(client.config.host).to.be.equal(esConfig.host);
			expect(client.config.hosts).to.be.undefined;

			setTimeout(function() {
				infoLogSpy.restore();
				errorLogSpy.restore();

				sinon.assert.notCalled(infoLogSpy);
				sinon.assert.called(errorLogSpy);

				afterSubTest(done);
			}, 3000);
		});

		it('Should connect using hosts config parameter', function(done) {
			var esConfig = clone(common.config.ElasticSearch2);
			var infoLogSpy = sinon.spy(TelepatLogger.prototype, 'info');

			try {
				var client = new esAdapter(esConfig);
			} catch (e) {
				expect(e).to.be.undefined;
			}

			expect(client.config.hosts).to.deep.equal(esConfig.hosts);
			expect(client.config.host).to.be.undefined;

			client.onReady(function() {
				infoLogSpy.restore();

				sinon.assert.calledWith(infoLogSpy, 'Connected to ElasticSearch MainDatabase');

				afterSubTest(done);
			});
		});
	});
};
