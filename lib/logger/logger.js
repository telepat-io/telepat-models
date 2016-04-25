var winston = require('winston');
var dateformat = require('dateformat');

var TelepatLogger = function(options) {
	this.options = options;

	TelepatLogger.loggers = {
		Syslog: 'winston-syslog'
	};

	if (options.type != 'Console') {
		try {
			require(TelepatLogger.loggers[options.type])[options.type];
			winston.add(winston.transports[options.type], options.settings);
			winston.remove(winston.transports.Console);
		} catch (e) {
			console.log('Could not load winston logger: '+e);
		}
	} else {
		winston.colorize = true;
	}

	winston.setLevels(winston.config.syslog.levels);
	winston.level = options.settings.level || 'info';
};

/**
 *
 * @param {string} level
 * @param {string} message
 */
TelepatLogger.prototype.log = function(level, message) {
	var timestamp = dateformat(new Date(), 'yyyy-mm-dd HH:MM:ss.l');

	message = '['+timestamp+']['+this.options.name+'] '+message;
	winston.log(level, message);
};

/**
 *
 * @param {string} message
 */
TelepatLogger.prototype.debug = function(message) {
	this.log('debug', message);
};

/**
 *
 * @param {string} message
 */
TelepatLogger.prototype.info = function(message) {
	this.log('info', message);
};

/**
 *
 * @param {string} message
 */
TelepatLogger.prototype.notice = function(message) {
	this.log('notice', message);
};

/**
 *
 * @param {string} message
 */
TelepatLogger.prototype.warning = function(message) {
	this.log('warn', message);
};

/**
 *
 * @param {string} message
 */
TelepatLogger.prototype.error = function(message) {
	this.log('error', message);
};

/**
 *
 * @param {string} message
 */
TelepatLogger.prototype.critical = function(message) {
	this.log('crit', message);
};

/**
 *
 * @param {string} message
 */
TelepatLogger.prototype.alert = function(message) {
	this.log('alert', message);
};

/**
 *
 * @param {string} message
 */
TelepatLogger.prototype.emergency = function(message) {
	this.log('emerg', message);
};

module.exports = TelepatLogger;
