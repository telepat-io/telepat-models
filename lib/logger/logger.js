const  winston = require('winston');
const  dateformat = require('dateformat');

class TelepatLogger {
	constructor(options) {
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
				console.log(`Could not load winston logger: ${e}`);
			}
		} else {
			winston.colorize = true;
		}

		winston.setLevels(winston.config.syslog.levels);
		winston.level = options.settings.level || 'info';
	}

	/**
     *
     * @param {string} level
     * @param {string} message
     */
	log(level, message) {
		let timestamp = dateformat(new Date(), 'yyyy-mm-dd HH:MM:ss.l');

		message = `[${timestamp}][${this.options.name}] ${message}`;
		winston.log(level, message);
	}

	/**
     *
     * @param {string} message
     */
	debug(message) {
		this.log('debug', message);
	}

	/**
     *
     * @param {string} message
     */
	info(message) {
		this.log('info', message);
	}

	/**
     *
     * @param {string} message
     */
	notice(message) {
		this.log('notice', message);
	}

	/**
     *
     * @param {string} message
     */
	warning(message) {
		this.log('warn', message);
	}

	/**
     *
     * @param {string} message
     */
	error(message) {
		this.log('error', message);
	}

	/**
     *
     * @param {string} message
     */
	critical(message) {
		this.log('crit', message);
	}

	/**
     *
     * @param {string} message
     */
	alert(message) {
		this.log('alert', message);
	}

	/**
     *
     * @param {string} message
     */
	emergency(message) {
		this.log('emerg', message);
	}
}
module.exports = TelepatLogger;
