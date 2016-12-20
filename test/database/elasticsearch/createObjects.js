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

module.exports = function CreateObjects() {
	describe('ElasticSearchDB.createObjects', function() {
		after(afterTest);

		it('Call function with invalid argument', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.createObjects(undefined, function(errs, results) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidFieldValue.code);
						expect(results).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Call function with an empty array', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.createObjects(undefined, function(errs, results) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidFieldValue.code);
						expect(results).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Call function with an object that doesn\'t have a type or an id', function(done) {
			var obj = {
				_id: 52490,
				_type: 'notok',
				test: 'some value'
			};

			var loggerWarning = sinon.spy(TelepatLogger.prototype, 'warning');

			async.series([
				function(cb) {
					esAdapterConnection.createObjects([obj], cb);
				},
				function(cb) {
					esConnection.count({
						index: esConfig.index,
						body: {
							query: {
								match_all: {}
							}
						}
					}, function(err, res) {
						if (err)
							return cb(err);

						loggerWarning.restore();
						sinon.assert.calledOnce(loggerWarning);
						expect(res.count).to.equal(0);
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Create one simple object', function(done) {
			var objId = guid.v4();
			var obj = {
				id: objId,
				type: 'test',
				field: 'somefield value'
			};

			async.series([
				function(cb) {
					esAdapterConnection.createObjects([obj], cb);
				},
				function(cb) {
					esConnection.get({
						index: esConfig.index,
						type: 'test',
						id: objId
					}, function(err, res) {
						if (err)
							return cb(err);

						expect(res).to.have.property('found', true);
						expect(res._source).to.deep.equal(obj);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						id: objId,
						refresh: true
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Create multiple objects', function(done) {
			var objects = [];

			for(var i=0; i < 1000; i++) {
				objects.push({id: guid.v4(), type: 'test', value: i*i});
			}

			async.series([
				function(cb) {
					esAdapterConnection.createObjects(objects, function(err) {
						//we need a timeout because the index is not refreshed for non-builtin object types
						setTimeout(function() {
							cb(err);
						}, 800);
					});
				},
				function(cb) {
					esConnection.count({
						index: esConfig.index,
						type: 'test'
					}, function(err, res) {
						if (err)
							return cb(err);
						expect(res.count).to.equal(objects.length);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						id: '',
						refresh: true
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Create multiple objects, some of which shouldn\'t pass because of missing id/type', function(done) {
			var objects = [];
			var totalCreatedObjectCount = 0;

			for(var i=0; i < 1000; i++) {
				if (i % 25 && i % 50)
					totalCreatedObjectCount++;
				objects.push({id: i % 25 ? guid.v4() : undefined, type: i % 50 ? 'test' : undefined, value: i*i});
			}

			var loggerWarning = sinon.spy(TelepatLogger.prototype, 'warning');

			async.series([
				function(cb) {
					esAdapterConnection.createObjects(objects, function(err) {
						//we need a timeout because the index is not refreshed for non-builtin object types
						setTimeout(function() {
							cb(err);
						}, 1000);

						loggerWarning.restore();
						sinon.assert.calledOnce(loggerWarning);
					});
				},
				function(cb) {
					esConnection.count({
						index: esConfig.index,
						type: 'test'
					}, function(err, res) {
						if (err)
							return cb(err);
						expect(res.count).to.equal(totalCreatedObjectCount);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						id: '',
						refresh: true
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Create builtin type objects which should make the index refresh automatically (no wait)', function(done) {
			var objects = [];
			var builtinModels = ['application', 'admin', 'user', 'user_metadata', 'context'];

			for(var i=0; i < 1000; i++) {
				objects.push({id: guid.v4(), type: builtinModels[i%5], value: i*i});
			}

			async.series([
				function(cb) {
					esAdapterConnection.createObjects(objects, cb);
				},
				function(cb) {
					esConnection.count({
						index: esConfig.index,
						body: {
							query: {
								match_all: {}
							}
						}
					}, function(err, res) {
						if (err)
							return cb(err);
						expect(res.count).to.equal(objects.length);
						cb();
					});
				},
				function(cb) {
					var bulk = objects.map(function(o) {
						return {delete: {_id: o.id, _type: o.type}};
					});

					esConnection.bulk({
						index: esConfig.index,
						body: bulk,
						refresh: true
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Create builtin type objects mixed with app objects which should make the index refresh automatically (no wait)', function(done) {
			var objects = [];
			var models = ['context', 'test', 'some_model'];

			for(var i=0; i < 1000; i++) {
				objects.push({id: guid.v4(), type: models[i%3], value: i*i});
			}

			async.series([
				function(cb) {
					esAdapterConnection.createObjects(objects, cb);
				},
				function(cb) {
					esConnection.count({
						index: esConfig.index,
						body: {
							query: {
								match_all: {}
							}
						}
					}, function(err, res) {
						if (err)
							return cb(err);
						expect(res.count).to.equal(objects.length);
						cb();
					});
				},
				function(cb) {
					var bulk = objects.map(function(o) {
						return {delete: {_id: o.id, _type: o.type}};
					});

					esConnection.bulk({
						index: esConfig.index,
						body: bulk,
						refresh: true
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Create app objects which shouldn\'t trigger the index refresh (no wait, objects available for search should be smaller)', function(done) {
			var objects = [];

			for(var i=0; i < 1000; i++) {
				objects.push({id: guid.v4(), type: 'test', value: i*i});
			}

			async.series([
				function(cb) {
					esAdapterConnection.createObjects(objects, cb);
				},
				function(cb) {
					esConnection.count({
						index: esConfig.index,
						body: {
							query: {
								match_all: {}
							}
						}
					}, function(err, res) {
						if (err)
							return cb(err);
						expect(res.count).to.be.below(objects.length);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						id: '',
						refresh: true
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it('Catch an ES error (because, for example, the mapping doesn\'t match the mapping of another object)', function(done) {
			var objId = guid.v4();
			var obj = {
				id: objId,
				type: 'context',
				float: 32.2
			};

			var invalidObj = {
				id: guid.v4(),
				type: 'context',
				float: 'this should a float, not a string'
			};

			var errorLog = sinon.spy(TelepatLogger.prototype, 'error');

			async.series([
				function(cb) {
					esAdapterConnection.createObjects([obj], cb);
				},
				function(cb) {
					esAdapterConnection.createObjects([invalidObj], function(err, res) {
						if (err)
							return cb(err);

						errorLog.restore();
						sinon.assert.calledOnce(errorLog);
						cb();
					});
				},
				function(cb) {
					esConnection.count({
						index: esConfig.index,
						type: 'context'
					}, function(err, res) {
						if (err)
							return cb(err);

						expect(res.count).to.be.equal(1);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'context',
						id: objId,
						refresh: true
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});
	});
}
