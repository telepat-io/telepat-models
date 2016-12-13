var dot = require('dot-object');
var validator = require('validator');
var TelepatError = require('./TelepatError');
var async = require('async');
var fs = require('fs');
var clone = require('clone');
var Application = require('./Application');

var ConfigurationManager = function(specFile, configFile) {
	this.specFile = specFile;
	this.configFile = configFile;

	/**
	 * This object holds the collection of all groups containing the grouped variables
	 * @type {{string}}
	 */
	this.exclusivityGroups = {};

	/**
	 *
	 * @type {{string[]}}
	 */
	this.foundExclusiveVariables = {};
};

ConfigurationManager.prototype.load = function(callback) {
	var self = this;

	async.series([
		function(callback1) {
			fs.readFile(self.specFile, {encoding: 'utf8'}, function(err, contents) {
				if (err) {
					callback1(TelepatError(TelepatError.errors.ServerConfigurationFailure, [err.message]));
				} else {
					self.spec = JSON.parse(contents);
					callback1();
				}
			});
		},
		function(callback1) {
			fs.readFile(self.configFile, {encoding: 'utf8'}, function(err, contents) {
				if (err) {
					callback1(TelepatError(TelepatError.errors.ServerConfigurationFailure, [err.message]));
				} else {
					self.config = JSON.parse(contents);
					callback1();
				}
			});
		}
	], function(err) {
		if (err)
			throw err;
		else {
			self._loadExclusivityGroups();
			callback();
		}
	});
};

ConfigurationManager.prototype._loadExclusivityGroups = function(spec) {
	spec = spec || this.spec.root;

	for(var i in spec) {
		if (spec[i].exclusive_group) {
			if (!this.exclusivityGroups[spec[i].exclusive_group])
				this.exclusivityGroups[spec[i].exclusive_group] = [spec[i].name];
			else
				this.exclusivityGroups[spec[i].exclusive_group].push(spec[i].name);
		}
		if (spec[i].root) {
			this._loadExclusivityGroups(spec[i].root);
		}
	}
};

/**
 *
 * @param {object} [spec]
 * @param {object} [config]
 * @returns {boolean|TelepatError}
 */
ConfigurationManager.prototype._validate = function(spec, config, rootName) {
	var result = true;
	spec = spec || this.spec.root;
	config = config || this.config;
	rootName = rootName || '';

	for(var s in spec) {
		var varName = spec[s].name;

		if (spec[s].exclusive_group && config[spec[s].name]) {
			if (!this.foundExclusiveVariables[spec[s].exclusive_group])
				this.foundExclusiveVariables[spec[s].exclusive_group] = [varName];
			else
				this.foundExclusiveVariables[spec[s].exclusive_group].push(varName);
		}

		var varValue = config[spec[s].name];

		if (spec[s].env_var && process.env[spec[s].env_var] && !spec[s].root) {
			var theEnvVar = process.env[spec[s].env_var];

			if (spec[s].type == 'array') {
				varValue = theEnvVar ? theEnvVar.split(' ') : undefined;
			} else if (spec[s].type == 'bool') {
				varValue = !!theEnvVar;
			} else {
				varValue = theEnvVar
			}
			config[spec[s].name] = varValue;
		} else if (spec[s].root && !spec[s].optional && !varValue) {
			config[spec[s].name] = varValue = {};
		}

		result = result && this.verifyVariable(varValue, spec[s], rootName);

		if (result instanceof TelepatError)
			return result;
	}

	return result;
};

ConfigurationManager.prototype.test = function() {
	return this._validate();
}

/**
 *
 * @param {*} variable
 * @param {Object} specVariable
 * @param {string} specVariable.name Name of the variable
 * @param {string} specVariable.env_var Name of the environment variable to check for, if it's not present in the file
 * @param {string} specVariable.type The type of the variable (int, float, array, object, string, bool)
 * @param {string} specVariable.array_type The type of the array's elements
 * @param {string} specVariable.optional The test passes if the variable is not set, null or empty
 * @param {string} specVariable.exclusive_group Exclusivity group for a config variable. Only 1 variable can be in this
 * group.
 * @param {array} specVariable.enum This variable can only have these values
 * @param {Object} specVariable.required_by This variable is verified only when a specific variable has a certain value
 * @param {array} specVariable.root Allows for nested objects
 * @return {boolean|TelepatError} true if variable passed or an error describing the problem if it didn't pass
 */
ConfigurationManager.prototype.verifyVariable = function(variable, specVariable, rootName) {
	if (!specVariable.name) {
		console.log('Spec file ' + this.specFile + ' has a variable which is missing the "name"' +
			' property');
		return true;
	}

	var fullVarName = rootName + '.' + specVariable.name;

	if (specVariable.required_by) {
		var requiredVarName = Object.keys(specVariable.required_by)[0];
		var requiredVarValue = specVariable.required_by[requiredVarName];

		if (dot.pick(requiredVarName, this.config) != requiredVarValue)
			return true;
	}

	// because nested objects don't have environment variables (only their children) we need to simmulate an empty object
	// in the loaded configuration
	if (specVariable.root && variable instanceof Object && !Object.keys(variable).length)
		return this._validate(specVariable.root, dot.pick(fullVarName.slice(1), this.config), fullVarName);

	if (specVariable.optional)
		return true;
	//if the value in the config file doen't exist and it also doesn't belong in a exclusive group, it means that it's
	//a mandatory config var which is missing
	else if (!variable && !specVariable.exclusive_group) {
		return new TelepatError(TelepatError.errors.ServerConfigurationFailure, [fullVarName +
			' is mising from the configuration']);
	} else if (!variable && specVariable.exclusive_group)
		return true;

	if (specVariable.enum && !this.enumVerifier(variable, specVariable.enum)) {
		return new TelepatError(TelepatError.errors.ServerConfigurationFailure, [fullVarName + ' can only have these ' +
			'values: "'+specVariable.enum.join(' ')+'"']);
	}

	if (!this.typeVerifier(variable, specVariable.type)) {
		return new TelepatError(TelepatError.errors.ServerConfigurationFailure, ['Invalid type for variable '
			+ fullVarName + ', must be "'+specVariable.type+'"']);
	}

	if (specVariable.array_type && !this.arrayTypeVerifier(variable, specVariable.array_type))
		return new TelepatError(TelepatError.errors.ServerConfigurationFailure, ['Invalid type for variable '
			+ fullVarName + ' or array has wrong type for its elements']);

	if (specVariable.exclusive_group) {
		// !(if the value doesn't exist in the config file but it's a part of an exclusive group)
		if (!(!variable && this.foundExclusiveVariables[specVariable.exclusive_group]) && !this.exclusivityVerifier(specVariable.exclusive_group))
			return new TelepatError(TelepatError.errors.ServerConfigurationFailure, ['At most one of these variables "'
				+ this.exclusivityGroups[specVariable.exclusive_group].join(' ') + '" can be present']);
	}

	return specVariable.root ? this._validate(specVariable.root, dot.pick(fullVarName.slice(1), this.config), fullVarName) : true;
};

/**
 *
 * @param {*} variable
 * @param {string} type
 * @returns {boolean}
 */
ConfigurationManager.prototype.typeVerifier = function(variable, type) {
	switch(type) {
		case 'int': {
			return validator.isInt('' + variable);
		}

		case 'float': {
			return validator.isFloat('' + variable);
		}

		case 'array': {
			return Array.isArray(variable);
		}

		case 'object': {
			return (variable instanceof Object);
		}

		case 'string': {
			return (typeof variable) === 'string';
		}

		case 'bool': {
			return (typeof variable) === 'boolean';
		}

		default:
			return true;
	}
};

/**
 * Checks the elements of an array if the are of the same specified type
 * @param {*} array
 * @param {string} type
 * @returns {boolean} True of all elements pass the type test
 */
ConfigurationManager.prototype.arrayTypeVerifier = function(array, type) {
	if (!Array.isArray(array))
		return false;

	for(var i in array) {
		if (!this.typeVerifier(array[i], type))
			return false;
	}
};

/**
 * Checks if the value is found in the enum array
 * @param {*} value
 * @param {Array} array
 * @returns {boolean} True of all elements pass the type test
 */
ConfigurationManager.prototype.enumVerifier = function(value, array) {
	return array.indexOf(value) !== -1;
};

/**
 * Verifies if the group hasn't been already created. Only one variable in this group should exist.
 * @param {string} group
 * @returns {boolean} returns true if the group is empty
 */
ConfigurationManager.prototype.exclusivityVerifier = function(group) {
	//we use .length == 1 because in _validate() we insert this variable here before calling this function
	return this.foundExclusiveVariables[group] && this.foundExclusiveVariables[group].length === 1;
};

module.exports = ConfigurationManager;