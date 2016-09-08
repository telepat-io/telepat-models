var dot = require('dot-object');
var validator = require('validator');
var TelepatError = require('./TelepatError');
var async = require('async');
var fs = require('fs');
var clone = require('clone');

var ConfigurationManager = function(specFile, configFile) {
	this.specFile = specFile;
	this.configFile = configFile;
	/**
	 * This object is used to check if a variables has already been in specific group
	 * @type {{Array}}
	 */
	this.exclusivity = {};
	/**
	 * This object holds the collection of all groups containing the grouped variables
	 * @type {{string}}
	 */
	this.exclusivityGroups = {};
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
		else
			callback();
	});
};

ConfigurationManager.prototype.validate = function() {

};

/**
 *
 * @param {*} variable
 * @param {Object} specVariable
 * @param {string} specVariable.name Name of the variable
 * @param {string} specVariable.type The type of the variable (int, float, array, object, string, bool)
 * @param {string} specVariable.array_type The type of the array's elements
 * @param {string} specVariable.optional The test passes if the variable is not set, null or empty
 * @param {string} specVariable.exclusive_group Exclusivity group for a config variable. Only 1 variable can be in this
 * group.
 * @param {string} specVariable.depends This variable depends on the validity of another variable
 * @return {boolean|TelepatError} true if variable passed or an error describing the problem if it didn't pass
 */
ConfigurationManager.prototype.verifyVariable = function(variable, specVariable) {
	var validity = true;
	var clonedSpec = null;

	if (specVariable.type && this.typeVerifier(variable, specVariable.type) === false)
		return new TelepatError(TelepatError.errors.ServerConfigurationFailure,
			['invalid configuration type for "'+specVariable.name+'", should be of type ' + specVariable.type]);

	if (this.arrayTypeVerifier(variable, specVariable.array_type) === false)
		return new TelepatError(TelepatError.errors.ServerConfigurationFailure,
			['invalid configuration type for "'+specVariable.name+'", should be of type ' + specVariable.type +
			+ 'containing elements of type ' + specVariable.array_type]);

	//even if its optional and it does exist, we must validate it as well
	if (specVariable.optional && this.optionalVerifier(variable)) {
		return true;
	} else {
		//cloning the specVar because we need to remove the optional field otherwise it will loop infinitely
		clonedSpec = clone(specVariable, false, 1);
		delete clonedSpec.optional;
		//we don't need to test nested objects HERE (it will be tested eventually in *validate*)
		delete clonedSpec.nested;

		return this.verifyVariable(variable, clonedSpec);
	}

	if (specVariable.exclusive_group && this.exclusivityVerifier(specVariable.exclusive_group)) {
		this.exclusivityGroups[specVariable.exclusive_group] = specVariable.name;
	} else {
		return new TelepatError(TelepatError.errors.ServerConfigurationFailure,
			['invalid configuration type for "'+specVariable.name+'", the following variables are mutually ' +
			'exclusive: ' + this.exclusivityGroups[specVariable.exclusive_group].join(' ')]);
	}

	if (specVariable.depends) {
		var dependency = dot.pick(specVariable.depends, this.config);

		if (!this.dependsVerifier(dependency)) {
			return new TelepatError(TelepatError.errors.ServerConfigurationFailure,
				['invalid configuration type for "'+specVariable.name+'", the variable depends on the variable' +
				specVariable.depends + 'which doesn\'t exist or is empty']);
		}
	}

	//we skip spec fields that don't have any of the above fields. FIX YOUR DAMN SPEC FILE !
	return true;
};

/**
 *
 * @param {*} variable
 * @param {string} type
 * @returns {boolean}
 */
ConfigurationManager.prototype.typeVerifier = function(variable, type) {
	console.log(arguments);
	switch(type) {
		case 'int': {
			return validator.isInt(variable);
		}

		case 'float': {
			return validator.isFloat(variable);
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
 *
 * @param {*} variable
 * @returns {boolean} returns true of the variable is truely optional (undefined, null or empty)
 */
ConfigurationManager.prototype.optionalVerifier = function(variable) {
	return (variable === '') || (variable === null) || (variable === undefined) ||
		((typeof variable === 'object') && Object.keys(variable).length === 0) ||
		(Array.isArray(variable) && variable.length === 0);
};

/**
 * Verifies if the group hasn't been already created. Only one variable in this group should exist.
 * @param {string} group
 * @returns {boolean} returns true if the group is empty
 */
ConfigurationManager.prototype.exclusivityVerifier = function(group) {
	return this.exclusivityGroups[group] === undefined;
};

/**
 * Checks if a variable exists because of another variable depends on it
 * @param {*} dependency The value of the variable. Should be non-null and not and empty string
 * @return {boolean} True if the dependency exists and is valid, false otherwise.
 */
ConfigurationManager.prototype.dependsVerifier = function(dependency) {
	return ((dependency !== '') && (dependency !== null) && (dependency !== undefined) &&
		(dependency.length !== 0)) || ((typeof dependency === 'object') && Object.keys(dependency).length !== 0);
};

module.exports = ConfigurationManager;