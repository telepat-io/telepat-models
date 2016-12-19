var common = require('../../common');
var chai = require('chai');
var expect = chai.expect;
var assert = chai.assert;
chai.should();
chai.use(require('chai-things'));
var sinon = require('sinon');
var clone = require('clone');
var async = require('async');
var es = require('elasticsearch');
var guid = require('uuid');
var esAdapter = require('../../../lib/database/elasticsearch_adapter');
var TelepatError = require('../../../lib/TelepatError');
var TelepatLogger = require('../../../lib/logger/logger');

module.exports = function DeleteObjects(callback) {
	describe('ElasticSearch.deleteObjects', function() {
		after(afterTest);

		it('Should return errors in the callback because of invalid param', function(done) {
			esAdapterConnection.deleteObjects(undefined, function(errs) {
				expect(errs).to.have.length(1);
				expect(errs[0]).to.be.instanceof(TelepatError);
				expect(errs[0]).to.have.property('code', '038');

				afterSubTest(done);
			});
		});

		it('Should return empty array of errors because of empty object as first param of function', function(done) {
			esAdapterConnection.deleteObjects({}, function(errs) {
				expect(errs).to.have.length(0);

				afterSubTest(done);
			});
		});

		it('Should return object not found error in callback', function(done) {
			esAdapterConnection.deleteObjects({'2349uh23i': 'some_type'}, function(errs) {
				expect(errs).to.have.length(1);
				expect(errs[0]).to.be.instanceof(TelepatError);
				expect(errs[0]).to.have.property('code', '034');

				afterSubTest(done);
			});
		});

		it('Should delete an object that exists', function(done) {
			var obj = {
				id: guid.v4(),
				type: 'test',
				field: 'value'
			};

			async.series([
				function(cb) {
					esConnection.index({
						index: common.config.ElasticSearch1.index,
						type: obj.type,
						id: obj.id,
						body: obj,
						refresh: true
					}, cb);
				},
				function(cb) {
					var objToDelete = {};
					objToDelete[obj.id] = obj.type;
					esAdapterConnection.deleteObjects(objToDelete, function(errs) {
						expect(errs).to.have.length(0);
						setTimeout(cb, 1000);
					});
				},
				function(cb) {
					esConnection.get({
						index: common.config.ElasticSearch1.index,
						type: obj.type,
						id: obj.id
					}, function(err, res) {
						expect(err).to.be.instanceof(Error);
						expect(err.status).to.be.equal(404);
						expect(res).to.have.property('found', false);
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});
	});
};
