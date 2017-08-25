let Application = require('./Application');

class Channel {
	constructor(appId, props) {
		this.props = {};
		this.filter = null;
		this.mask = 0;
		this.forceInvalid = false;
		this.errorMessage = '';

		if (!appId)
			throw new Error('Must supply application ID to channel constructor');
		else
			this.appId = appId;

		if (props)
			this.props = props;
	}

	model(model, id) {
		if (model) {
			if (Application.apps[this.appId] && Application.apps[this.appId].modelSchema(model).isValidModel()) {
				this.props.model = model;
			} else if (Application.isBuiltInModel(model))
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
	}

	parent(parent) {
		if (parent && parent.model && parent.id) {
			this.mask |= Channel.MASKS.PARENT;
			this.props.parent = parent;
		} else
			this.forceInvalid = true;

		return this;
	}
	
	context(context) {
		if (context) {
			this.mask |= Channel.MASKS.CONTEXT;
			this.props.context = context;
		} else
			this.forceInvalid = true;

		return this;
	}

	user(user) {
		if (user) {
			this.mask |= Channel.MASKS.USER;
			this.props.user = user;
		} else
			this.forceInvalid = true;

		return this;
	}

	setFilter(filter) {
		if (filter)
			this.filter = filter;
		else
			this.forceInvalid = true;

		return this;
	}

	isValid() {
		let mask = Channel.validChannels[this.mask];

		//only built in models can have a subscription on all without a context
		if (this.mask === 4 && Channel.builtInModels.indexOf(this.props.model) === -1)	{
			this.errorMessage = 'Only builtin models (user,context) can be subscribed to all without a context';
			return false;
		}

		let result = !this.forceInvalid && (mask !== undefined);

		if (!result)
			this.errorMessage = 'Invalid channel "'+this.mask+'".';

		return result;
	}

	get(options) {
		if (!this.isValid()) {
			throw new Error('Invalid channel with mask "'+this.mask+'"');
		}

		let validChannel = 	Channel.validChannels[this.mask];

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

		case 7: {	// MASKS.CONTEXT | MASKS.USER | MASKS.MODEL
			validChannel = validChannel.replace('{context}', this.props.context);
			validChannel = validChannel.replace('{user_id}', this.props.user);
			validChannel = validChannel.replace('{model}', this.props.model);

			break;
		}

		case 12: { // MASKS.MODEL | MASKS.PARENT
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
	}

	static cloneFrom(channel) {
		let c = new Channel(channel.appId, channel.props);
		c.mask = channel.mask;

		return c;
	}

	clone() {
		let c = new Channel(this.appId, this.props);
		c.mask = this.mask;
		c.filter = this.filter;

		return c;
	}

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


module.exports = Channel;
