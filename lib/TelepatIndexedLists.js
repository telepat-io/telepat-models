var Application = require('./Application');
var utils = require('../utils/utils');
var async = require('async');

var TelepatIndexedLists = {
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

		this.redis.sadd([redisKey, memeberName, memeberValue], function(err) {
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
		var tranzaction = this.redis.multi();

		members.forEach(function(member) {
			tranzaction.sismember([redisKey, member]);
		});

		tranzaction.exec(function(err, results) {
			if (err) return callback(err);

			var memebershipResults = {};

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

		utils.scanRedisKeysPattern(keyPattern, this.redis, function(err, results) {
			if (err) return callback(err);

			self.redis.del(results, function(err, removed) {
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

		this.redis.srem([redisKey, memeber], function(err, removed) {
			if (err) return callback(err);
			callback(null, new Boolean(removed));
		});
	}
};

TelepatIndexedLists.redis = Application.redisCacheClient;

module.exports = TelepatIndexedLists;
