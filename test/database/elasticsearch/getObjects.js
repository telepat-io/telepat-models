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

module.exports = function GetObjects() {
	describe('ElasticSearchDB.getObjects', function() {
		after(afterTest);

		it('Call function with invalid first argument', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.getObjects(undefined, function(errs, results, versions) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidFieldValue.code);
						expect(results).to.be.empty;
						expect(versions).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Call function with first argument as an empty array', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.getObjects([], function(errs, results, versions) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidFieldValue.code);
						expect(results).to.be.empty;
						expect(versions).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Get one object that should exist', function(done) {
			var savedObject = {
				test: 'some testing string'
			};
			var savedObjectId = guid.v4();

			async.series([
				function(cb) {
					esConnection.index({
						index: esConfig.index,
						type: 'test',
						id: savedObjectId,
						body: savedObject,
						refresh: true
					}, cb);
				},
				function(cb) {
					esAdapterConnection.getObjects([savedObjectId], function(errs, results, versions) {
						expect(errs).to.be.empty;
						expect(results).to.have.lengthOf(1);
						expect(Object.keys(versions)).to.have.lengthOf(1);
						expect(results[0]).to.deep.equal(savedObject);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						id: savedObjectId
					}, function(err, result) {
						expect(result).to.have.property('found', true);
						cb(err);
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Get one object that shouldn\'t exist', function(done) {
			var someId = guid.v4();

			async.series([
				function(cb) {
					esAdapterConnection.getObjects([someId], function(errs, results, versions) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.have.property('code', TelepatError.errors.ObjectNotFound.code)
						expect(results).to.be.empty;
						expect(Object.keys(versions)).to.be.empty;
						cb();
					});
				}
			], function() {
				afterSubTest(done);
			});
		});

		it('Get multiple objects that should exist', function(done) {
			var bulkOperations = [];
			var objects = [];
			var objectIds = [];

			for(var i = 0; i < 1000; i++) {
				var id = guid.v4();
				bulkOperations.push({index: {
					_type: 'test',
					_id: id
				}});
				bulkOperations.push({
					id: id,
					type: 'test',
					square: i*i
				});
				objects.push({
					id: id,
					type: 'test',
					square: i*i
				});
				objectIds.push(id);
			}

			async.series([
				function(cb) {
					esConnection.bulk({
						index: esConfig.index,
						body: bulkOperations,
						refresh: true
					}, function(err, result) {
						cb(err);
					});
				},
				function(cb) {
					esAdapterConnection.getObjects(objectIds, function(errs, results, versions) {
						expect(errs).to.be.empty;
						expect(results).to.eql(objects);
						expect(Object.keys(versions)).to.have.lengthOf(objects.length);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						refresh: true,
						id: ''
					}, function(err, result) {
						cb(err);
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Get multiple objects some of which shouldn\'t exist', function(done) {
			var bulkOperations = [];
			var objectsThatShouldBeReturned = [];
			var objectIds = [];

			for(var i = 0; i < 1000; i++) {
				var id = guid.v4();
				bulkOperations.push({index: {
					_type: 'test',
					_id: id
				}});
				bulkOperations.push({
					id: id,
					type: 'test',
					square: i*i
				});

				if (i % 25)
					objectsThatShouldBeReturned.push({
						id: id,
						type: 'test',
						square: i*i
					});
				objectIds.push(i % 25 ? id : guid.v4());
			}

			async.series([
				function(cb) {
					esConnection.bulk({
						index: esConfig.index,
						body: bulkOperations,
						refresh: true
					}, function(err, result) {
						cb(err);
					});
				},
				function(cb) {
					esAdapterConnection.getObjects(objectIds, function(errs, results, versions) {
						expect(errs).to.have.lengthOf(40);
						errs.should.all.have.property('code', '034');

						expect(results).to.eql(objectsThatShouldBeReturned);
						expect(Object.keys(versions)).to.have.lengthOf(objectIds.length - 40);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						refresh: true,
						id: ''
					}, function(err, result) {
						cb(err);
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});
	});
}
