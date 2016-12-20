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

module.exports = function DeleteObjects() {
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

		it('Should return empty array of errors because object has a non-string value', function(done) {
			esAdapterConnection.deleteObjects({id: []}, function(errs) {
				expect(errs).to.have.length(1);
				expect(errs[0]).to.have.property('code', '038');

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

		it('Should delete multiple objects which all exist', function(done) {
			var objects = [];
			var bulkOperations = [];

			for(var i = 0; i < 1000; i++) {
				var id = guid.v4();
				bulkOperations.push({index: {
					_type: 'testDelete',
					_id: id
				}});
				bulkOperations.push({
					id: id,
					type: 'testDelete',
					square: i*i
				});
				objects.push({
					id: id,
					type: 'testDelete',
					square: i*i
				});
			}

			async.series([
				function(cb) {
					esConnection.bulk({
						index: common.config.ElasticSearch1.index,
						body: bulkOperations,
						refresh: true
					}, cb);
				},
				function(cb) {
					var objectsToDelete = {};

					objects.forEach(function(obj) {
						objectsToDelete[obj.id] = obj.type;
					});

					esAdapterConnection.deleteObjects(objectsToDelete, function(errs) {
						expect(errs).to.have.length(0);
						setTimeout(cb, 1000);
					});
				},
				function(cb) {
					esConnection.count({
						index: common.config.ElasticSearch1.index,
						type: 'testDelete'
					}, function(err, res) {
						expect(err).to.be.not.ok;
						expect(res).to.have.property('count', 0);
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Should delete multiple objects some of which don\'t exist', function(done) {
			var objects = [];
			var bulkOperations = [];

			for(var i = 0; i < 1000; i++) {
				var id = guid.v4();
				bulkOperations.push({index: {
					_type: 'testDelete',
					_id: id
				}});
				bulkOperations.push({
					id: id,
					type: 'testDelete',
					square: i*i
				});
				objects.push({
					id: id,
					type: 'testDelete',
					square: i*i
				});
			}

			async.series([
				function(cb) {
					esConnection.bulk({
						index: common.config.ElasticSearch1.index,
						body: bulkOperations,
						refresh: true
					}, cb);
				},
				function(cb) {
					var objectsToDelete = {};

					objects.forEach(function(obj, index) {
						objectsToDelete[index % 25 === 0 ? guid.v4() : obj.id] = obj.type;
					});

					esAdapterConnection.deleteObjects(objectsToDelete, function(errs) {
						expect(errs).to.have.length(40);
						errs.should.all.have.property('code', '034');
						setTimeout(cb, 1000);
					});
				},
				function(cb) {
					esConnection.count({
						index: common.config.ElasticSearch1.index,
						type: 'testDelete',
						refresh: true
					}, function(err, res) {
						expect(err).to.be.not.ok;
						expect(res).to.have.property('count', 40);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: common.config.ElasticSearch1.index,
						type: 'testDelete',
						id: '',
						refresh: true
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Should delete 2 objects which both exist, one of which is a builtin model (immediate index refresh)', function(done) {
			var obj = {
				id: guid.v4(),
				type: 'test',
				field: 'value'
			};

			var builtIn = {
				id: guid.v4(),
				type: 'application',
				field: 'value'
			};

			async.series([
				function(cb) {
					esConnection.index({
						index: common.config.ElasticSearch1.index,
						type: obj.type,
						id: obj.id,
						body: obj
					}, cb);
				},
				function(cb) {
					esConnection.index({
						index: common.config.ElasticSearch1.index,
						type: builtIn.type,
						id: builtIn.id,
						body: builtIn,
						refresh: true
					}, cb);
				},
				function(cb) {
					var objToDelete = {};
					objToDelete[obj.id] = obj.type;
					objToDelete[builtIn.id] = builtIn.type;

					esAdapterConnection.deleteObjects(objToDelete, function(errs) {
						expect(errs).to.have.length(0);
						cb();
					});
				},
				function(cb) {
					esConnection.count({
						index: common.config.ElasticSearch1.index,
						type: ''
					}, function(err, res) {
						expect(err).to.not.be.ok;
						expect(res).to.have.property('count', 0);
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});
	});
};
