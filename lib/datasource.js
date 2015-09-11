function Datasource() {
	/**
	 *
	 * @type {Main_Database_Adapter}
	 */
	this.dataStorage = null;
	this.cacheStorage = null;
};

/**
 *
 * @param {Main_Database_Adapter} database
 */
Datasource.prototype.setMainDatabase = function(database) {
	this.dataStorage = database;
};

Datasource.prototype.setCacheDatabase = function(database) {
	this.cacheStorage = database;
};

module.exports = Datasource;
