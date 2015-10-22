/**
 *
 * @type {TelepatLogger}
 */
var TelepatLogger = require('./logger');
var Syslog = require('node-syslog');

var SysLog = function(facility, options) {
	TelepatLogger.call(this, facility, options);

	this.options = options || [];

	var sysLogOptions = {
		LOG_PID			: 0x01,
		LOG_CONS		: 0x02,
		LOG_ODELAY		: 0x04,
		LOG_NDELAY		: 0x08,
		LOG_NOWAIT		: 0x10,
		LOG_PERROR		: 0x20,
	};
	var optionsMask = 0;

	this.options.forEach(function(option) {
		if (sysLogOptions[option] !== undefined)
			optionsMask |= sysLogOptions[option];
	});

	Syslog.init(this.facility, optionsMask, Syslog.LOG_SYSLOG);
};

SysLog.prototype = Object.create(TelepatLogger.prototype);

SysLog.prototype.log = function(level, message) {
	Syslog.log(level, message);
};

module.exports = SysLog;
