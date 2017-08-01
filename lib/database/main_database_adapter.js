class Main_Database_Adapter {
	constructor(connection) {
		this.connection = connection;
		/**
		 *
		 * @type {Function|null}
		 */
		this.onReadyCallback = null;
	}

	/**
	 *
	 * @param {Function} callback Called after the database has finished setting up
	*/
	onReady(callback) {
		this.onReadyCallback = callback;
	}

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
	getObjects(ids, callback) {
		throw new Error('Database adapter "getObjects" not implemented');
	}

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
	searchObjects(options, callback) {
		throw new Error('Database adapter "searchObjects" not implemented');
	}

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
	countObjects(options, callback) {
		throw new Error('Database adapter "countObjects" not implemented');
	}

	/**
	 * @callback CUDObjectsCb
	 * @param {TelepatError[]|null} err
	 */
	/**
	  * @abstract
	  * @param {Object[]} objects
	  * @param {CUDObjectsCb} callback
	*/
	createObjects(objects, callback) {
		throw new Error('Database adapter "createObjects" not implemented');
	}

	/**
	 * @abstract
	 * @param {Object[]} patches
	 * @param {CUDObjectsCb} callback
	 */
	updateObjects(patches, callback) {
		throw new Error('Database adapter "updateObjects" not implemented');
	}
	/**
	 * @abstract
	 * @param {Object[]} ids {ID => modelName}
	 * @param {CUDObjectsCb} callback
	 */
	deleteObjects(ids, callback) {
		throw new Error('Database adapter "deleteObjects" not implemented');
	}
}

module.exports =  Main_Database_Adapter;
