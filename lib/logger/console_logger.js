/**
 *
 * @type {TelepatLogger}
 */
var TelepatLogger = require('./logger');
var fs = require('fs');
var dateformat = require('dateformat');
require('colors');

var ConsoleLogger = function(facility, options) {
	TelepatLogger.call(this, facility, options);

	/*if (this.options.out_file) {
		this.outputHandle = fs.createWriteStream(this.options.out_file, {flags: 'a+'});
	}
	if (this.options.err_file) {
		this.errorHandle = fs.createWriteStream(this.options.err_file, {flags: 'a+'});
	}*/

};

ConsoleLogger.prototype = Object.create(TelepatLogger.prototype);

ConsoleLogger.prototype.log = function(level, message) {
	var timestamp = dateformat(new Date(), 'yyyy-mm-dd HH:MM:ss.l');
	var color = 'white';

	if (level == 7)
		color = 'gray';
	else if (level == 6)
		color = 'cyan';
	else if (level == 4)
		color = 'yellow';
	else if (level <= 3)
		color = 'red';

	var logMessage = '['+timestamp+']['+this.facility+']['+TelepatLogger.logLevels[level][color]+'] '+message;

	var where = (level <= TelepatLogger.LOG_ERR) ? 'error' : 'log';
	console[where](logMessage);

	/*if (where == 'error') {
		if (this.errorHandle)
			this.errorHandle.write(logMessage, 'utf-8');
		else
			console.error(logMessage);
	} else {
		if (this.outputHandle)
			this.outputHandle.write(logMessage, 'utf-8');
		else
			console.log(logMessage);
	}*/
};

module.exports = ConsoleLogger;
