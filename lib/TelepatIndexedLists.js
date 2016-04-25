var Application = require('./Application');
var TelepatError = require('./TelepatError');
var utils = require('../utils/utils');
var async = require('async');

var TelepatIndexedList = {
	/**
	 * @callback appendCb
	 * @param {Error|null} [err]
	 */

	/**
	 * @callback removeCb
	 * @param {Error|null} [err]
	 * @param {Boolean} [removed]
	 */

	/**
	 * @callback getCb
	 * @param {Error|null} [err]
	 * @param {Object[]} [results]
	 */

	/**
	 *
	 * @param {string} listName Name of the list
	 * @param {string} indexedProperty The property that's being indexed by
	 * @param {Object} object The key of this object is the member that will be inserted with its value
	 * @param {appendCb} callback
	 */
	append: function(listName, indexedProperty, object , callback) {
		var redisKey = 'blg:til:'+listName+':'+indexedProperty;
		var memeberName = Object.keys(object)[0];
		var memeberValue = object[memeberName];

		Application.redisCacheClient.sadd([redisKey, memeberName, memeberValue], function(err) {
			if (err) return callback(err);
			else callback();
		});
	},

	/**
	 *
	 * @param {string} listName Name of the list
	 * @param {string} indexedProperty The property that's being indexed by
	 * @param {string[]} members Array of memembers to check for
	 * @param {getCb} callback
	 */
	get: function(listName, indexedProperty, members, callback) {
		var redisKey = 'blg:til:'+listName+':'+indexedProperty;
		var tranzaction = Application.redisCacheClient.multi();

		tranzaction.exists([redisKey]);

		members.forEach(function(member) {
			tranzaction.sismember([redisKey, member]);
		});

		tranzaction.exec(function(err, results) {
			if (err) return callback(err);

			var memebershipResults = {};

			if (!results[0])
				return callback(new TelepatError(TelepatError.errors.TilNotFound, [listName]));

			results.splice(0, 1);

			async.forEachOf(results, function(result, index, c) {
				memebershipResults[members[index]] = new Boolean(result);
				c();
			}, function() {
				callback(null, memebershipResults);
			});
		});
	},

	/**
	 *
	 * @param {string} listName Name of the list to remove
	 * @param {removeCb} callback
	 */
	removeList: function(listName, callback) {
		var keyPattern = 'blg:til:'+listName+':*';
		var self = this;

		utils.scanRedisKeysPattern(keyPattern, Application.redisCacheClient, function(err, results) {
			if (err) return callback(err);

			if (!results.length)
				return callback(new TelepatError(TelepatError.errors.TilNotFound, [listName]));

			Application.redisCacheClient.del(results, function(err, removed) {
				if (err) return callback(err);

				callback(null, new Boolean(removed));
			});
		})
	},

	/**
	 *
	 * @param {string} listName Name of the list
	 * @param {string} indexedProperty The property that's being indexed by
	 * @param {string[]} members Array of memembers to remove
	 * @param {removeCb} callback
	 */
	removeMember: function(listName, indexedProperty, memeber, callback) {
		var redisKey = 'blg:til:'+listName+':'+indexedProperty;
		var tranzaction = Application.redisCacheClient.multi();

		tranzaction.exists([redisKey]);
		tranzaction.srem([redisKey, memeber]);

		tranzaction.exec(function(err, replies) {
			if (err) return callback(err);

			if (!replies[0])
				return callback(new TelepatError(TelepatError.errors.TilNotFound, [listName]));

			callback(null, new Boolean(replies[1]));
		});
	}
};

module.exports = TelepatIndexedList;
