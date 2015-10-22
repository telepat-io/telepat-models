var TelepatLogger = function(facility, options) {
	this.facility = facility;
	this.options = options || {};
};

TelepatLogger.LOG_DEBUG = 7;
TelepatLogger.LOG_INFO = 6;
TelepatLogger.LOG_NOTICE = 5;
TelepatLogger.LOG_WARNING = 4;
TelepatLogger.LOG_ERR = 3;
TelepatLogger.LOG_CRIT = 2;
TelepatLogger.LOG_ALERT = 1;
TelepatLogger.LOG_EMERG = 0;

TelepatLogger.logLevels = [
	'LOG_EMERG',
	'LOG_ALERT',
	'LOG_CRIT',
	'LOG_ERR',
	'LOG_WARNING',
	'LOG_NOTICE',
	'LOG_INFO',
	'LOG_DEBUG',
];

TelepatLogger.prototype.log = function(level, message) {
	throw new Error('TelepatError: Unimplemented log function');
};

TelepatLogger.prototype.debug = function(message) {
	this.log(TelepatLogger.LOG_DEBUG, message);
};

TelepatLogger.prototype.info = function(message) {
	this.log(TelepatLogger.LOG_INFO, message);
};

TelepatLogger.prototype.notice = function(message) {
	this.log(TelepatLogger.LOG_NOTICE, message);
};

TelepatLogger.prototype.warning = function(message) {
	this.log(TelepatLogger.LOG_WARNING, message);
};

TelepatLogger.prototype.error = function(message) {
	this.log(TelepatLogger.LOG_ERR, message);
};

TelepatLogger.prototype.critical = function(message) {
	this.log(TelepatLogger.LOG_CRIT, message);
};

TelepatLogger.prototype.alert = function(message) {
	this.log(TelepatLogger.LOG_ALERT, message);
};

TelepatLogger.prototype.emergency = function(message) {
	this.log(TelepatLogger.LOG_EMERG, message);
};

module.exports = TelepatLogger;
