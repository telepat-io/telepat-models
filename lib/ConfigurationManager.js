let dot = require('dot-object');
let validator = require('validator');
let TelepatError = require('./TelepatError');
let async = require('async');
let fs = require('fs');


class ConfigurationManager {
	constructor(specFile, configFile) {
		this.specFile = specFile;
		
		this.configFile = configFile;
		/**
		 * This object holds the collection of all groups containing the grouped letiables
		 * @type {{string}}
		 */
		this.exclusivityGroups = {};
		/**
		 *
		 * @type {{string[]}}
		 */
		this.foundExclusiveletiables = {};
	}

	load(callback) {
		let self = this;
		async.series([
			(callback1) => {
				fs.readFile(self.specFile, {encoding: 'utf8'}, (err, contents) => {
					if (err) {
						callback1(TelepatError(TelepatError.errors.ServerConfigurationFailure, [err.message]));
					} else {
						this.spec = JSON.parse(contents);
						callback1();
					}
				});
			},
			(callback1) => {
				fs.readFile(this.configFile, {encoding: 'utf8'}, (err, contents) => {
					if (err) {
						callback1(TelepatError(TelepatError.errors.ServerConfigurationFailure, [err.message]));
					} else {
						this.config = JSON.parse(contents);
						callback1();
					}
				});
			}
		], (err) => {
			if (err)
				throw err;
			else {
				this.loadExclusivityGroups();
				callback();
			}
		});
	}

	loadExclusivityGroups(spec) {
		spec = spec || this.spec.root;

		for(let i in spec) {
			if (spec[i].exclusive_group) {
				if (!this.exclusivityGroups[spec[i].exclusive_group])
					this.exclusivityGroups[spec[i].exclusive_group] = [spec[i].name];
				else
					this.exclusivityGroups[spec[i].exclusive_group].push(spec[i].name);
			}
			if (spec[i].root) {
				this.loadExclusivityGroups(spec[i].root);
			}
		}
	}
	/**
	*
	* @param {object} [spec]
	* @param {object} [config]
	* @returns {boolean|TelepatError}
	*/
	validate(spec, config, rootName) {
		let result = true;
		spec = spec || this.spec.root;
		config = config || this.config;
		rootName = rootName || '';

		for(let s in spec) {
			let letName = spec[s].name;

			if (spec[s].exclusive_group && config[spec[s].name]) {
				if (!this.foundExclusiveletiables[spec[s].exclusive_group])
					this.foundExclusiveletiables[spec[s].exclusive_group] = [letName];
				else
					this.foundExclusiveletiables[spec[s].exclusive_group].push(letName);
			}

			let letValue = config[spec[s].name];

			if (spec[s].env_let && process.env[spec[s].env_let] && !spec[s].root) {
				let theEnvlet = process.env[spec[s].env_let];

				if (spec[s].type == 'array') {
					letValue = theEnvlet ? theEnvlet.split(' ') : undefined;
				} else if (spec[s].type == 'bool') {
					letValue = !!theEnvlet;
				} else {
					letValue = theEnvlet;
				}
				config[spec[s].name] = letValue;
			} else if (spec[s].root && !spec[s].optional && !letValue) {
				config[spec[s].name] = letValue = {};
			}

			result = result && this.verifyletiable(letValue, spec[s], rootName);

			if (result instanceof TelepatError) {
				return result;
			}
		}

		return result;
	}

	test() {
		return this.validate();
	}

	/**
	*
	* @param {*} letiable
	* @param {Object} specletiable
	* @param {string} specletiable.name Name of the letiable
	* @param {string} specletiable.env_let Name of the environment letiable to check for, if it's not present in the file
	* @param {string} specletiable.type The type of the letiable (int, float, array, object, string, bool)
	* @param {string} specletiable.array_type The type of the array's elements
	* @param {string} specletiable.optional The test passes if the letiable is not set, null or empty
	* @param {string} specletiable.exclusive_group Exclusivity group for a config letiable. Only 1 letiable can be in this
	* group.
	* @param {array} specletiable.enum This letiable can only have these values
	* @param {Object} specletiable.required_by This letiable is verified only when a specific letiable has a certain value
	* @param {array} specletiable.root Allows for nested objects
	* @return {boolean|TelepatError} true if letiable passed or an error describing the problem if it didn't pass
	*/
	verifyletiable(letiable, specletiable, rootName) {
		if (!specletiable.name) {
			console.log('Spec file ' + this.specFile + ' has a letiable which is missing the "name"' +
				' property');
			return true;
		}

		let fullletName = rootName + '.' + specletiable.name;

		if (specletiable.required_by) {
			let requiredletName = Object.keys(specletiable.required_by)[0];
			let requiredletValue = specletiable.required_by[requiredletName];

			if (dot.pick(requiredletName, this.config) != requiredletValue)
				return true;
		}

		// because nested objects don't have environment letiables (only their children) we need to simmulate an empty object
		// in the loaded configuration
		if (specletiable.root && letiable instanceof Object && !Object.keys(letiable).length)
			return this.validate(specletiable.root, dot.pick(fullletName.slice(1), this.config), fullletName);

		if (specletiable.optional)
			return true;
		//if the value in the config file doen't exist and it also doesn't belong in a exclusive group, it means that it's
		//a mandatory config let which is missing
		else if (!letiable && !specletiable.exclusive_group) {
			return new TelepatError(TelepatError.errors.ServerConfigurationFailure, [fullletName +
				' is mising from the configuration']);
		} else if (!letiable && specletiable.exclusive_group)
			return true;

		if (specletiable.enum && !this.enumVerifier(letiable, specletiable.enum)) {
			return new TelepatError(TelepatError.errors.ServerConfigurationFailure, [fullletName + ' can only have these ' +
				'values: "'+specletiable.enum.join(' ')+'"']);
		}

		if (!this.typeVerifier(letiable, specletiable.type)) {
			return new TelepatError(TelepatError.errors.ServerConfigurationFailure, ['Invalid type for letiable '
				+ fullletName + ', must be "'+specletiable.type+'"']);
		}

		if (specletiable.array_type && !this.arrayTypeVerifier(letiable, specletiable.array_type))
			return new TelepatError(TelepatError.errors.ServerConfigurationFailure, ['Invalid type for letiable '
				+ fullletName + ' or array has wrong type for its elements']);

		if (specletiable.exclusive_group) {
			// !(if the value doesn't exist in the config file but it's a part of an exclusive group)
			if (!(!letiable && this.foundExclusiveletiables[specletiable.exclusive_group]) && !this.exclusivityVerifier(specletiable.exclusive_group))
				return new TelepatError(TelepatError.errors.ServerConfigurationFailure, ['At most one of these letiables "'
					+ this.exclusivityGroups[specletiable.exclusive_group].join(' ') + '" can be present']);
		}

		return specletiable.root ? this.validate(specletiable.root, dot.pick(fullletName.slice(1), this.config), fullletName) : true;
	}

	/**
	*
	* @param {*} letiable
	* @param {string} type
	* @returns {boolean}
	*/
	typeVerifier(letiable, type) {
		switch(type) {
		case 'int': {
			return validator.isInt('' + letiable);
		}

		case 'float': {
			return validator.isFloat('' + letiable);
		}

		case 'array': {
			return Array.isArray(letiable);
		}

		case 'object': {
			return (letiable instanceof Object);
		}

		case 'string': {
			return (typeof letiable) === 'string';
		}

		case 'bool': {
			return (typeof letiable) === 'boolean';
		}

		default:
			return true;
		}
	}
	/**
	 * Checks the elements of an array if the are of the same specified type
	 * @param {*} array
	 * @param {string} type
	 * @returns {boolean} True of all elements pass the type test
	 */
	arrayTypeVerifier(array, type) {
		if (!Array.isArray(array))
			return false;

		for(let i in array) {
			if (!this.typeVerifier(array[i], type))
				return false;
		}
	}
	/**
	 * Checks if the value is found in the enum array
	 * @param {*} value
	 * @param {Array} array
	 * @returns {boolean} True of all elements pass the type test
	 */
	enumVerifier(value, array) {
		return array.indexOf(value) !== -1;
	}

	/**
	 * Verifies if the group hasn't been already created. Only one letiable in this group should exist.
	 * @param {string} group
	 * @returns {boolean} returns true if the group is empty
	*/
	exclusivityVerifier(group) {
		//we use .length == 1 because in _validate() we insert this letiable here before calling this function
		return this.foundExclusiveletiables[group] && this.foundExclusiveletiables[group].length === 1;
	}

}
module.exports = ConfigurationManager;