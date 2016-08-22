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
		var commandArgs = ['blg:til:' + listName + ':' + indexedProperty + ':' + object[indexedProperty]];

		for(var prop in object) {
			if (typeof object[prop] != 'object') {
				commandArgs.push(prop, object[prop]);
			}
		}

		Application.redisCacheClient.hmset(commandArgs, function(err) {
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
		var baseKey = 'blg:til:'+listName+':'+indexedProperty;
		var tranzaction = Application.redisCacheClient.multi();

		members.forEach(function(member) {
			tranzaction.hgetall([baseKey + ':' + member]);
		});

		tranzaction.exec(function(err, replies) {
			if (err) return callback(err);
			var memebershipResults = {};

			async.forEachOf(replies, function(result, index, c) {
				memebershipResults[members[index]] = result || false;
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
	removeMember: function(listName, indexedProperty, members, callback) {
		var baseKey = 'blg:til:'+listName+':'+indexedProperty;
		var existingMembers = {}; //to avoid duplicate members
		var delArguments = [];

		members.forEach(function(member) {
			if (!existingMembers[member]) {
				delArguments.push([baseKey + ':' + member]);
			 	existingMembers[member] = true;
			}
		});

	  	Application.redisCacheClient.del(delArguments, function(err, reply) {
		  	callback(err, reply);
		});
	}
};

module.exports = TelepatIndexedList;
