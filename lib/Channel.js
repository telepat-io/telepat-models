var utils = require('../utils/utils');
var Application = require('./Application');
var objectClone = require('clone');

var Channel = function Channel(appId, props) {
	this.props = {};
	this.filter = null;
	this.mask = 0;
	this.forceInvalid = false;

	if (!appId)
		throw new Error('Must supply application ID to channel constructor');
	else
		this.appId = appId;

	if (props)
		this.props = props;
}

Channel.keyPrefix = "blg";

Channel.MASKS = {
	CONTEXT: 1,
	USER: 2,
	MODEL: 4,
	PARENT: 8,
	ID: 16,
};

Channel.validChannels = {
	4:  Channel.keyPrefix+":{appId}:{model}",											//channel used for built-in models (users, contexts)
	5:  Channel.keyPrefix+":{appId}:context:{context}:{model}",							//the Channel of all objects from a context
	7:  Channel.keyPrefix+":{appId}:context:{context}:users:{user_id}:{model}",			//the Channel of all objects from a context from an user
	12: Channel.keyPrefix+":{appId}:{parent_model}:{parent_id}:{model}",				//the Channel of all objects belong to a parent
	14: Channel.keyPrefix+":{appId}:users:{user_id}:{parent_model}:{parent_id}:{model}",//the Channel of all comments from event 1 from user 16
	20: Channel.keyPrefix+":{appId}:{model}:{id}",										//the Channel of one item
};

Channel.builtInModels = ['user', 'context'];

Channel.prototype.model = function(model, id) {
	if (model) {
		if (Application.loadedAppModels[this.appId] !== undefined && Application.loadedAppModels[this.appId].schema !== undefined && Application.loadedAppModels[this.appId].schema[model]) {
			this.props.model = Application.loadedAppModels[this.appId].schema[model].namespace;
		} else if (Channel.builtInModels.indexOf(model) !== -1)
			this.props.model = model;
		else
			throw new Error('Model "'+model+'" is not a valid model name');

		this.mask |= Channel.MASKS.MODEL;
	}

	if (id) {
		this.props.modelId = id;
		this.mask |= Channel.MASKS.ID;
	}


	if (!model && !id)
		this.forceInvalid = true;

	return this;
};

Channel.prototype.parent = function(parent) {
	if (parent && parent.model && parent.id) {
		this.mask |= Channel.MASKS.PARENT;
		this.props.parent = {model: Application.loadedAppModels[this.appId].schema[parent.model].namespace, id: parent.id};
	} else
		this.forceInvalid = true;

	return this;
}

Channel.prototype.context = function(context) {
	if (context) {
		this.mask |= Channel.MASKS.CONTEXT;
		this.props.context = context;
	} else
		this.forceInvalid = true;

	return this;
};

Channel.prototype.user = function(user) {
	if (user) {
		this.mask |= Channel.MASKS.USER;
		this.props.user = user;
	} else
		this.forceInvalid = true;

	return this;
};

Channel.prototype.setFilter = function(filter) {
	if (filter)
		this.filter = filter;
	else
		this.forceInvalid = true;

	return this;
};

Channel.prototype.isValid = function() {
	var mask = Channel.validChannels[this.mask];

	//only built in models can have a subscription on all without a context
	if (this.mask === 4 && Channel.builtInModels.indexOf(this.props.model) === -1)
		return false;

	return !this.forceInvalid && (mask !== undefined);
};

Channel.prototype.get = function(options) {
	if (!this.isValid())
		throw new Error('Invalid channel with mask "'+this.mask+'"');

	var validChannel = 	Channel.validChannels[this.mask];

	validChannel = validChannel.replace('{appId}', this.appId);

	switch(this.mask) {
		case 4: {
			if (Channel.builtInModels.indexOf(this.props.model) === -1)
				throw new Error('Channel with mask "4" can only be used with built in models');

			validChannel = validChannel.replace('{model}', this.props.model);

			break;
		}
		case 5: { // MASKS.CONTEXT | MASKS.MODEL
			validChannel = validChannel.replace('{context}', this.props.context);
			validChannel = validChannel.replace('{model}', this.props.model);

			break;
		}

		case 7: {	// MASKS.CONTEXT | MASKS.USER | MASKS.MODEL | MASKS.ALL
			validChannel = validChannel.replace('{context}', this.props.context);
			validChannel = validChannel.replace('{user_id}', this.props.user);
			validChannel = validChannel.replace('{model}', this.props.model);

			break;
		}

		case 12: { // MASKS.MODEL | MASKS.PARENT | MASKS.ALL
			validChannel = validChannel.replace('{parent_model}', this.props.parent.model);
			validChannel = validChannel.replace('{parent_id}', this.props.parent.id);
			validChannel = validChannel.replace('{model}', this.props.model);

			break;
		}

		case 14: { // MASKS.USER | MASKS.MODEL | MASKS.PARENT
			validChannel = validChannel.replace('{parent_model}', this.props.parent.model);
			validChannel = validChannel.replace('{parent_id}', this.props.parent.id);
			validChannel = validChannel.replace('{model}', this.props.model);
			validChannel = validChannel.replace('{user_id}', this.props.user);

			break;
		}

		case 20: { // MASKS.MODEL | MASKS.ID
			validChannel = validChannel.replace('{model}', this.props.model);
			validChannel = validChannel.replace('{id}', this.props.modelId);

			break;
		}
	}

	if (this.filter)
		validChannel += ':filter:'+(new Buffer(JSON.stringify(this.filter))).toString('base64');

	if (options) {
		if (options.deltas)
			validChannel += ':deltas';
	}


	return validChannel;
};

/**
 *
 * @param {Channel} channel
 * @returns {Channel}
 */
Channel.cloneFrom = function(channel) {
	var c = new Channel(channel.appId, channel.props);
	c.mask = channel.mask;

	return c;
};

Channel.prototype.clone = function() {
	var c = new Channel(this.appId, this.props);
	c.mask = this.mask;
	c.filter = this.filter;

	return c;
}

module.exports = Channel;
