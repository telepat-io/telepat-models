var Main_Database_Adapter = function(connection) {
	this.applicationModel = require('../../models/application.json');

	if(!this.applicationModel)
		throw new Error('Model spec file does not exist.');

	this.contextModel = require('../../models/context.json');

	if (!this.contextModel)
		throw new Error('Model spec file does not exist.');

	this.userModel = require('../../models/user.json');

	if (!this.userModel)
		throw new Error('Model spec file does not exist.');

	this.connection = connection;
	this.onReadyCallback = null;
};

Main_Database_Adapter.prototype.onReady = function(callback) {
	this.onReadyCallback = callback;
};

/**
 * @callback returnObjectsCb
 * @param {TelepatError[]} err
 * @param {Object[]} results
 */
/**
 *
 * @param {String[]} ids
 * @param {returnObjectsCb} callback
 */
Main_Database_Adapter.prototype.getObjects = function(ids, callback) {
	throw new Error('Database adapter "getObjects" not implemented');
};

/**
 * @callback ScanCallback
 * @param {Object[]} results
 */
/**
 *
 * @param {Object} options
 * @param {string} {options.modelName}
 * @param {FilterBuilder} [options.filters]
 * @param {Object} [options.sort]
 * @param {Number} [options.offset]
 * @param {Number} [options.limit]
 * @param {string[]} [options.fields]
 * @param {ScanCallback} [options.scanFunction]
 * @param {returnObjectsCb} callback
 */
Main_Database_Adapter.prototype.searchObjects = function(options, callback) {
	throw new Error('Database adapter "searchObjects" not implemented');
};

/**
 * @callback countObjectsCB
 * @param {Object} err
 * @param {Object} result
 * @param {Number} result.count
 * @param {Number} [result.aggregation]
 */
/**
 *
 * @param {Object} options
 * @param {string} options.modelName
 * @param {FilterBuilder} [options.filters]
 * @param {Object} [options.aggregation]
 * @param {countObjectsCB} callback
 */
Main_Database_Adapter.prototype.countObjects = function(options, callback) {
	throw new Error('Database adapter "countObjects" not implemented');
};

/**
 * @callback CUDObjectsCb
 * @param {TelepatError[]|null} err
 */
/**
 *
 * @param {Object[]} objects
 * @param {CUDObjectsCb} callback
 */
Main_Database_Adapter.prototype.createObjects = function(objects, callback) {
	throw new Error('Database adapter "createObjects" not implemented');
};

/**
 *
 * @param {Object[]} patches
 * @param {CUDObjectsCb} callback
 */
Main_Database_Adapter.prototype.updateObjects = function(patches, callback) {
	throw new Error('Database adapter "updateObjects" not implemented');
};

/**
 *
 * @param {Object[]} ids {ID => modelName}
 * @param {CUDObjectsCb} callback
 */
Main_Database_Adapter.prototype.deleteObjects = function(ids, callback) {
	throw new Error('Database adapter "deleteObjects" not implemented');
};

module.exports = Main_Database_Adapter;
