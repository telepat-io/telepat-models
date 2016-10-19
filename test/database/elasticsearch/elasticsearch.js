var common = require("../../common");
var expect = common.expect;
var assert = common.assert;
var sinon = require('sinon');
var clone = require('clone');
var async = require("async");
var es = require('elasticsearch');
var guid = require('uuid');
var esAdapter = require('../../../lib/database/elasticsearch_adapter');
var TelepatError = require('../../../lib/TelepatError');
var TelepatLogger = require('../../../lib/logger/logger');

esConfig = common.config.ElasticSearch1;

/**
 *
 * @param {Function} done
 */
esConnection = new es.Client(clone(common.config.ElasticSearch1));

/**
 *
 * @type {ElasticSearchDB|null}
 */
esAdapterConnection = new esAdapter(clone(common.config.ElasticSearch1));

subTestIndex = 1;

/**
 *
 * @param {Function} done
 */
afterTest = function(done, cb) {
	done();
	cb();
};

/**
 *
 * @param {Function} done
 */
afterSubTest = function(done, err) {
	subTestIndex++;
	done(err);
};

var tests = [
	require('./getObjects'),
	require('./createObjects'),
	require('./updateObjects')
];

tests.forEach(function(t) {
	t();
});
