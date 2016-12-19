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

module.exports = function UpdateObjects(callback) {
	describe('ElasticSearchDB.updateObjects', function() {
		after(function(done) {
			afterTest(done, callback);
		});

		it('Call function with invalid argument type', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.updateObjects(undefined, function(errs, res) {
						expect(errs).to.have.length(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidFieldValue.code);
						expect(res).to.be.empty;

						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Call function with empty array', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.updateObjects([], function(errs, res) {
						expect(errs).to.have.length(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidFieldValue.code);
						expect(res).to.be.empty;

						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Call function with empty patch', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.updateObjects([{}], function(errs, res) {
						expect(errs).to.have.length(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidPatch.code);
						expect(res).to.be.empty;

						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Call function with invalid patch: missing path', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.updateObjects([{op: 'replace', value: 0}], function(errs, res) {
						expect(errs).to.have.length(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidPatch.code);
						expect(res).to.be.empty;

						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Call function with invalid patch: malformed path', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.updateObjects([{op: 'replace', path: 'test', value: 0}], function(errs, res) {
						expect(errs).to.have.length(1);
						expect(errs[0]).to.be.instanceof(TelepatError);
						expect(errs[0]).to.have.property('code', TelepatError.errors.InvalidPatch.code);
						expect(res).to.be.empty;

						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Update non existant object', function(done) {
			async.series([
				function(cb) {
					esAdapterConnection.updateObjects([{op: 'replace', path: 'test/41312/value', value: 'some modified string'}], function(errs, res) {
						expect(errs).to.have.lengthOf(1);
						expect(errs[0]).to.have.property('code', TelepatError.errors.ObjectNotFound.code);
						expect(res).to.be.empty;
						cb();
					});
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Update one object', function(done) {
			var initialObject = {
				id: guid.v4(),
				type: 'test',
				value: 'some string'
			};

			var modifiedObject = {};

			async.series([
				function(cb) {
					esConnection.index({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id,
						body: initialObject,
						refresh: true
					}, cb);
				},
				function(cb) {
					esAdapterConnection.updateObjects([{op: 'replace', path: initialObject.type + '/' + initialObject.id + '/value', value: 'some modified string'}], function(errs, res) {
						expect(errs).to.be.empty;
						expect(res).to.have.property(initialObject.id);
						expect(res[initialObject.id]).to.have.property('value', 'some modified string');

						modifiedObject = res[initialObject.id];

						setTimeout(cb, 800);
					});
				},
				function(cb) {
					esConnection.get({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, function(err, res) {
						if (err)
							return cb(err);

						expect(res.found).to.be.true;
						expect(res._version).to.equal(2);
						expect(res._source).to.eql(modifiedObject);
						cb();
					})
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Update multiple distinct objects', function(done) {
			var initialObjectsBulk = [];
			var modifiedObjects = {}
			var patches = [];

			for(var i = 0; i < 100; i++) {
				var id =  guid.v4();
				initialObjectsBulk.push({index: {
					_id: id,
					_type: 'test'
				}});
				initialObjectsBulk.push({
					id: id,
					type: 'test',
					square: i
				});
				patches.push({
					op: 'replace',
					path: 'test/' + id + '/square',
					value: i*i
				});
				modifiedObjects[id] = {id: id, type: 'test', square: i*i};
			}

			async.series([
				function(cb) {
					esConnection.bulk({
						index: esConfig.index,
						body: initialObjectsBulk,
						refresh: true
					}, cb);
				},
				function(cb) {
					esAdapterConnection.updateObjects(patches, function(errs, res) {
						expect(errs).to.be.empty;

						for(var id in res) {
							delete res[id].modified;
						}

						expect(res).to.eql(modifiedObjects);

						setTimeout(cb, 1000);
					});
				},
				function(cb) {
					esConnection.search({
						index: esConfig.index,
						type: 'test',
						body: {
							query: {
								match_all: {}
							}
						},
						size: 99999
					}, function(err, res) {
						if (err)
							return cb(err);

						expect(res.hits.total).to.be.equal(patches.length);

						var dbObjects = {};

						res.hits.hits.forEach(function(o) {
							dbObjects[o._id] = o._source;
							delete dbObjects[o._id].modified;
						});

						expect(dbObjects).to.eql(modifiedObjects);
						cb();
					})
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

		it('Update multiple distinct objects some of which should fail because of invalid patch', function(done) {
			var initialObjectsBulk = [];
			var modifiedObjects = {}
			var patches = [];

			for(var i = 0; i < 100; i++) {
				var id =  guid.v4();
				initialObjectsBulk.push({index: {
					_id: id,
					_type: 'test'
				}});
				initialObjectsBulk.push({
					id: id,
					type: 'test',
					square: i
				});
				patches.push({
					op: 'replace',
					path: i % 10 ? 'test/' + id + '/square' : 'adasdtrq',
					value: i*i
				});
				modifiedObjects[id] = {id: id, type: 'test', square: i % 10 ? i*i : i};
			}

			async.series([
				function(cb) {
					esConnection.bulk({
						index: esConfig.index,
						body: initialObjectsBulk,
						refresh: true
					}, cb);
				},
				function(cb) {
					esAdapterConnection.updateObjects(patches, function(errs, res) {
						expect(errs).to.have.length(10);
						expect(Object.keys(res)).to.have.lengthOf(patches.length - 10);

						setTimeout(cb, 1000);
					});
				},
				function(cb) {
					esConnection.search({
						index: esConfig.index,
						type: 'test',
						body: {
							query: {
								match_all: {}
							}
						},
						size: 99999
					}, function(err, res) {
						if (err)
							return cb(err);

						expect(res.hits.total).to.be.equal(patches.length);

						var dbObjects = {};

						res.hits.hits.forEach(function(o) {
							dbObjects[o._id] = o._source;
							delete dbObjects[o._id].modified;
						});

						expect(dbObjects).to.eql(modifiedObjects);
						cb();
					})
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

		it('Update multiple distinct objects some of which should fail because they don\'t exist', function(done) {
			var initialObjectsBulk = [];
			var modifiedObjects = {}
			var patches = [];

			for (var i = 0; i < 100; i++) {
				var id = guid.v4();
				var id2 = guid.v4();

				initialObjectsBulk.push({
					index: {
						_id: id,
						_type: 'test'
					}
				});
				initialObjectsBulk.push({
					id: id,
					type: 'test',
					square: i
				});
				patches.push({
					op: 'replace',
					path: 'test/' + (i % 10 ? id : id2) + '/square',
					value: i * i
				});

				modifiedObjects[id] = {id: id, type: 'test', square: i % 10 ? i * i : i};
			}

			async.series([
				function (cb) {
					esConnection.bulk({
						index: esConfig.index,
						body: initialObjectsBulk,
						refresh: true
					}, cb);
				},
				function (cb) {
					esAdapterConnection.updateObjects(patches, function (errs, res) {
						expect(errs).to.have.lengthOf(10);

						errs.should.all.have.property('code', '034');

						expect(Object.keys(res)).to.have.lengthOf(patches.length - 10);

						setTimeout(cb, 1000);
					});
				},
				function (cb) {
					esConnection.search({
						index: esConfig.index,
						type: 'test',
						body: {
							query: {
								match_all: {}
							}
						},
						size: 99999
					}, function (err, res) {
						if (err)
							return cb(err);

						expect(res.hits.total).to.be.equal(patches.length);

						var dbObjects = {};

						res.hits.hits.forEach(function (o) {
							dbObjects[o._id] = o._source;
							delete dbObjects[o._id].modified;
						});

						expect(dbObjects).to.eql(modifiedObjects);
						cb();
					})
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: 'test',
						id: '',
						refresh: true
					}, cb);
				}
			], function (err) {
				afterSubTest(done, err);
			});
		});

		it('Update one object multiple times on the same property', function(done) {
			var initialObject = {
				id: guid.v4(),
				type: 'test',
				value: 'some string'
			};

			var modifiedObject = {};

			async.series([
				function(cb) {
					esConnection.index({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id,
						body: initialObject,
						refresh: true
					}, cb);
				},
				function(cb) {
					var patches = [
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'some modified string'
						},
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'some modified string x2'
						},
						{
							op: "replace",
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'some modified string x3'
						},
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'some modified string x4'
						},
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'x5'
						}
					];

					esAdapterConnection.updateObjects(patches, function(errs, res) {
						expect(errs).to.be.empty;
						expect(res).to.have.property(initialObject.id);
						expect(res[initialObject.id]).to.have.property('value', 'x5');

						modifiedObject = res[initialObject.id];

						setTimeout(cb, 800);
					});
				},
				function(cb) {
					esConnection.get({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, function(err, res) {
						if (err)
							return cb(err);

						expect(res.found).to.be.true;
						expect(res._version).to.be.at.least(2);
						expect(res._source).to.eql(modifiedObject);
						cb();
					})
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Update one object multiple times on different properties', function(done) {
			var initialObject = {
				id: guid.v4(),
				type: 'test',
				value1: 'some string',
				value2: 1,
				value3: 'ha'
			};

			var modifiedObject = {};

			async.series([
				function(cb) {
					esConnection.index({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id,
						body: initialObject,
						refresh: true
					}, cb);
				},
				function(cb) {
					var patches = [];

					for(var i = 0; i < 3; i++) {
						patches.push(
							{
								op: 'replace',
								path: initialObject.type + '/' + initialObject.id + '/value1',
								value: 'x' + ((i+1)*2)
							},
							{
								op: 'increment',
								path: initialObject.type + '/' + initialObject.id + '/value2',
								value: 1
							},
							{
								op: 'append',
								path: initialObject.type + '/' + initialObject.id + '/value3',
								value: 'ha'
							}
						);
					}

					esAdapterConnection.updateObjects(patches, function(errs, res) {
						expect(errs).to.be.empty;
						expect(res).to.have.property(initialObject.id);
						expect(res[initialObject.id]).to.have.property('value1', 'x6');
						expect(res[initialObject.id]).to.have.property('value2', 4);
						expect(res[initialObject.id]).to.have.property('value3', 'hahahaha');

						modifiedObject = res[initialObject.id];

						setTimeout(cb, 800);
					});
				},
				function(cb) {
					esConnection.get({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, function(err, res) {
						if (err)
							return cb(err);

						expect(res.found).to.be.true;
						expect(res._version).to.be.at.least(2);

						expect(res._source).to.have.property('value1', 'x6');
						expect(res._source).to.have.property('value2', 4);
						expect(res._source).to.have.property('value3', 'hahahaha');
						cb();
					})
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Update one object multiple times on the same property, but making separate requests', function(done) {
			var initialObject = {
				id: guid.v4(),
				type: 'test',
				value: 'some string'
			};

			var modifiedObject = {
				id: initialObject.id,
				type: 'test',
				value: 'x5'
			};

			async.series([
				function(cb) {
					esConnection.index({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id,
						body: initialObject,
						refresh: true
					}, cb);
				},
				function(cb) {
					var patches = [
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'some modified string'
						},
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'some modified string x2'
						},
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'some modified string x3'
						},
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'some modified string x4'
						},
						{
							op: 'replace',
							path: initialObject.type + '/' + initialObject.id + '/value',
							value: 'x5'
						}
					];

					async.eachSeries(patches, function(p, c) {
						esAdapterConnection.updateObjects([p], function(errs, res) {
							expect(errs).to.be.empty;
						});

						c();
					}, function(err) {
						if (err)
							return cb(err);

						setTimeout(cb, 1000);
					});
				},
				function(cb) {
					esConnection.get({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, function(err, res) {
						if (err)
							return cb(err);

						expect(res.found).to.be.true;
						expect(res._version).to.be.equal(6);
						cb();
					})
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			})
		});

		it('Update one object multiple times on different properties, but making separate requests', function(done) {
			var initialObject = {
				id: guid.v4(),
				type: 'test',
				value1: 'some string',
				value2: 1,
				value3: 'ha'
			};

			async.series([
				function(cb) {
					esConnection.index({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id,
						body: initialObject,
						refresh: true
					}, cb);
				},
				function(cb) {
					var patches = [];

					for(var i = 0; i < 3; i++) {
						patches.push(
							{
								op: 'replace',
								path: initialObject.type + '/' + initialObject.id + '/value1',
								value: 'x' + ((i+1)*2)
							},
							{
								op: 'increment',
								path: initialObject.type + '/' + initialObject.id + '/value2',
								value: 1
							},
							{
								op: 'append',
								path: initialObject.type + '/' + initialObject.id + '/value3',
								value: 'ha'
							}
						);
					}

					async.eachSeries(patches, function(p, c) {
						esAdapterConnection.updateObjects([p], function(errs, res) {
							expect(errs).to.be.empty;
						});

						c();
					}, function(err) {
						if (err)
							return cb(err);

						setTimeout(cb, 1000);
					});
				},
				function(cb) {
					esConnection.get({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, function(err, res) {
						if (err)
							return cb(err);

						//we can't assert the final values because the updates are not executed in order
						expect(res.found).to.be.true;
						expect(res._version).to.be.equal(10);
						cb();
					})
				},
				function(cb) {
					esConnection.delete({
						index: esConfig.index,
						type: initialObject.type,
						id: initialObject.id
					}, cb);
				}
			], function(err) {
				afterSubTest(done, err);
			});
		});
	});
}
