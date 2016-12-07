var common = require('../../common');
var clone = require('clone');
var es = require('elasticsearch');
var esAdapter = require('../../../lib/database/elasticsearch_adapter');

/**
 * @global
 */
esConfig = common.config.ElasticSearch1;

/**
 *	@global
 * 	@param {Function} done
 */
esConnection = new es.Client(clone(common.config.ElasticSearch1));

/**
 *
 * @global
 * @type {ElasticSearchDB|null}
 */
esAdapterConnection = new esAdapter(clone(common.config.ElasticSearch1));

subTestIndex = 1;

/**
 *
 * @global
 * @param {Function} done
 */
afterTest = function(done, cb) {
	done();
	cb();
};

/**
 *	@global
 * 	@param {Function} done
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
