var expect = require("chai").expect;
var assert = require("chai").assert;
var async = require("async");
var common = require("../common");
var es = require('elasticsearch');
var guid = require('uuid');
var esAdapter = require('../database/elasticsearch');

var esConfig = common.config.ElasticSearch1;

/**
 *
 * @param {Function} done
 */
var esConnection = new es.Client(esConfig);

/**
 *
 * @type {ElasticSearchDB|null}
 */
var esAdapterConnection = null;

var testIndex = 1;
var subTestIndex = 1;

/**
 *
 * @param {Function} done
 */
var afterTest = function(done, cb) {
	testIndex++;
	done();
};

/**
 *
 * @param {Function} done
 */
var afterSubTest = function(done, err) {
	subTestIndex++;
	done();
};


function GetObjects(callback) {
	describe(testIndex + ". " + "ElasticSearchDB.getObjects", function() {
		after(function(done) {
			afterTest(done, callback);
		});

		it(subTestIndex + ". invalid first argument", function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.getObjects(undefined, function(errs, results, versions) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.have.property("code", TelepatError.errors.InvalidFieldValue.code);
						expect(results).to.be.empty;
						expect(versions).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it(subTestIndex + ". first argument is an empty array", function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.getObjects([], function(errs, results, versions) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.have.property("code", TelepatError.errors.InvalidFieldValue.code);
						expect(results).to.be.empty;
						expect(versions).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it(subTestIndex + ". one object that should exist", function(done) {
			var savedObject = {
				test: "some testing string"
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
					}, function(err, result) {
						assert.isNotOk(err, "Error occured trying to create an object: " + err.message);
						cb();
					});
				},
				function(cb) {
					esAdapterConnection.getObjects([savedObjectId], function(errs, results, versions) {
						expect(errs).to.be.empty;
						expect(results).to.have.lengthOf(1);
						expect(versions).to.have.lengthOf(1);
						expect(results[0]).to.deep.equal(savedObject);
						expect(versions[0]).to.equal(1);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						id: savedObjectId
					}, function(err, result) {
						expect(result).to.have.property("_found", true);
						cb(err);
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it(subTestIndex + ". one object that shouldn't exist", function(done) {
			var someId = guid.v4();

			async.series([
				function(cb) {
					esAdapterConnection.getObjects([someId], function(errs, results, versions) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.have.property("code", TelepatError.errors.ObjectNotFound.code)
						expect(results).to.be.empty;
						expect(versions).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it(subTestIndex + ". multiple objects that should exist", function(done) {
			var bulkOperations = [];
			var objectIds = [];

			for(var i = 0; i < 1000; i++) {
				var id = guid.v4();
				bulkOperations.push({index: {
					_type: "test",
					_id: id
				}});
				bulkOperations.push({
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
						assert.isNotOk(err, "Error occured trying to create objects: " + err.message);
						//TODO: assert the length of result
						cb();
					});
				},
				function(cb) {
					esAdapterConnection.getObjects(objectIds, function(errs, results, versions) {
						expect(errs).to.be.empty;
						expect(results).to.have.lengthOf(objectIds.length);
						expect(versions).to.have.lengthOf(objectIds.length);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						refresh: true
					}, function(err, result) {
						cb(err);
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});

		it(subTestIndex + ". multiple objects some of which shouldn't exist", function(done) {
			var bulkOperations = [];
			var objectIds = [];

			for(var i = 0; i < 1000; i++) {
				var id = guid.v4();
				bulkOperations.push({index: {
					_type: "test",
					_id: id
				}});
				bulkOperations.push({
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
						assert.isNotOk(err, "Error occured trying to create objects: " + err.message);
						//TODO: assert the length of result
						cb();
					});
				},
				function(cb) {
					esAdapterConnection.getObjects(objectIds, function(errs, results, versions) {
						expect(errs).to.have.lengthOf(40);
						expect(results).to.have.lengthOf(objectIds.length - 40);
						expect(versions).to.have.lengthOf(objectIds.length - 40);
						cb();
					});
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: "test",
						refresh: true
					}, function(err, result) {
						cb(err);
					});
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});
	});
};

function CreateObjects(callback) {
	describe(testIndex + ". " + "ElasticSearchDB.createObjects", function() {
		after(function(done) {
			afterTest(done, callback);
		});

		it(subTestIndex + ". call function with invalid argument", function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.createObjects(undefined, function(errs, results) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.have.property("code", TelepatError.errors.InvalidFieldValue.code);
						expect(results).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it(subTestIndex + ". call function with an empty array", function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.createObjects(undefined, function(errs, results) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.have.property("code", TelepatError.errors.InvalidFieldValue.code);
						expect(results).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it(subTestIndex + ". call function with an object that doesn't have a type or an id", function(done) {
			var obj = {
				_id: 52490,
				_type: "notok",
				"test": "some value"
			};

			async.series([
				function(cb) {
					esAdapterConnection.createObjects(obj, function(errs) {
						expect(errs).to.have.lengthOf(0);
						cb();
					});
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
						assert.isNotOk(err, "Error occured trying to count objects: " + err.message);
						expect(res.count).to.equal(0);
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it(subTestIndex + ". create one simple object", function(done) {
			var obj = {
				id: guid.v4(),
				type: "test",
				field: "somefield value"
			};

			async.series([
				function(cb) {
					esAdapterConnection.createObjects(obj, function(err) {
						assert.isNotOk(err);
						cb();
					})
				},
				function(cb) {
					esConnection.search({
						index: esConfig.index,
						body: {
							query: {
								match_all: {}
							}
						}
					}, function(err, res) {
						assert.isNotOk(err, "Error occured trying to count objects: " + err.message);
						expect(res).to.have.deep.property("hits.total", 1);
						expect(res).to.have.deep.property("hits.hits[0]._source");
						expect(res.hits.hits[0]._source).to.deep.equal(obj);
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});
	});
};

async.series([
	function Connected(callback) {
		esConnection.ping({requestTimeout: Infinity}, callback);
	},
	function ESAdapter(callback) {
		esAdapterConnection = new esAdapter(esConfig);
		esAdapterConnection.onReady(callback);
	},
	GetObjects,
	CreateObjects
], function(err) {
	if (err) {
		throw err;
	}
});

