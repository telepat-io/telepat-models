var Main_Database_Adapter = function(connection) {
	this.connection = connection;
	/**
	 *
	 * @type {Function|null}
	 */
	this.onReadyCallback = null;
};

/**
 *
 * @param {Function} callback Called after the database has finished setting up
 */
Main_Database_Adapter.prototype.onReady = function(callback) {
	this.onReadyCallback = callback;
};

/**
 * @callback returnObjectsCb
 * @param {TelepatError[]} err
 * @param {Object[]} results
 */
/**
 * @abstract
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
 * @abstract
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
 * @abstract
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
 * @abstract
 * @param {Object[]} objects
 * @param {CUDObjectsCb} callback
 */
Main_Database_Adapter.prototype.createObjects = function(objects, callback) {
	throw new Error('Database adapter "createObjects" not implemented');
};

/**
 * @abstract
 * @param {Object[]} patches
 * @param {CUDObjectsCb} callback
 */
Main_Database_Adapter.prototype.updateObjects = function(patches, callback) {
	throw new Error('Database adapter "updateObjects" not implemented');
};

/**
 * @abstract
 * @param {Object[]} ids {ID => modelName}
 * @param {CUDObjectsCb} callback
 */
Main_Database_Adapter.prototype.deleteObjects = function(ids, callback) {
	throw new Error('Database adapter "deleteObjects" not implemented');
};

module.exports = Main_Database_Adapter;
