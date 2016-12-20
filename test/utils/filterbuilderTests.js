var common = require('../common');

/**
 * @global
 * @param {Function} done
 */
afterTest = function(done) {
	done();
};

var tests = [
	require('./builderNode')
];

tests.forEach(function(t) {
	t();
});
