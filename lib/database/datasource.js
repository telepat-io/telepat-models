class Datasource {
	constructor() {
		/**
         *
         * @type {Main_Database_Adapter}
         */
		this.dataStorage = null;
		this.cacheStorage = null;
	}

	/**
     *
     * @param {Main_Database_Adapter} database
     */
	setMainDatabase(database) {
		this.dataStorage = database;
	}

	setCacheDatabase(database) {
		this.cacheStorage = database;
	}
}


module.exports = Datasource;
