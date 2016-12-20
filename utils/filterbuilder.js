var TelepatError = require('../lib/TelepatError');

var BuilderNode = function(name) {
	if (BuilderNode.CONNECTORS.indexOf(name) === -1) {
		throw new TelepatError(TelepatError.errors.QueryError, ['unsupported query connector "'+name+'"']);
	}

	this.parent = null;
	/**
	 *
	 * @type {BuilderNode[]|Object[]}
	 */
	this.children = [];
	this.name = name;
};

BuilderNode.CONNECTORS = [
	'and',
	'or'
];

BuilderNode.FILTERS = [
	'is',
	'not',
	'exists',
	'range',
	'in_array',
	'like'
];

BuilderNode.prototype.addFilter = function(name, value) {
	if (BuilderNode.FILTERS.indexOf(name) !== -1) {
		var filter = {};
		filter[name] = value;
		this.children.push(filter);
	} else
		throw new TelepatError(TelepatError.errors.QueryError, ['invalid filter "'+name+'"']);
};

/**
 *
 * @param {BuilderNode} node
 */
BuilderNode.prototype.addNode = function(node) {
	node.parent = this;
	this.children.push(node);
};

/**
 *
 * @param {BuilderNode} node
 */
BuilderNode.prototype.removeNode = function(node) {
	var idx = this.children.indexOf(node);

	if (idx !== -1) {
		node.parent = null;
		return this.children.splice(idx, 1)[0];
	} else {
		return null;
	}
};

BuilderNode.prototype.toObject = function() {
	var obj = {};
	obj[this.name] = [];

	this.children.forEach(function(item) {
		if (item instanceof BuilderNode)
			obj[this.name].push(item.toObject());
		else
			obj[this.name].push(item);
	}, this);

	return obj;
};

var FilterBuilder = function(initial) {
	/**
	 *
	 * @type {null|BuilderNode}
	 */
	this.root = null;

	if (initial)
		this.root = new BuilderNode(initial);
	else
		this.root = new BuilderNode('and');

	this.pointer = this.root;
};

FilterBuilder.prototype.and = function() {
	if (this.root === null) {
		this.root = new BuilderNode('and');
	} else {
		var child = new BuilderNode('and');
		this.pointer.addNode(child);
		this.pointer = child;
	}

	return this;
};

FilterBuilder.prototype.or = function() {
	if (this.root === null) {
		this.root = new BuilderNode('or');
	} else {
		var child = new BuilderNode('or');
		this.pointer.addNode(child);
		this.pointer = child;
	}

	return this;
};

FilterBuilder.prototype.addFilter = function(name, value) {
	this.pointer.addFilter(name, value);

	return this;
};

FilterBuilder.prototype.removeNode = function() {
	if (this.root !== this.pointer) {
		var nodeToRemove = this.pointer;
		this.pointer = this.pointer.parent;

		return this.pointer.removeNode(nodeToRemove);
	} else
		return null;
};

FilterBuilder.prototype.isEmpty = function() {
	return this.root.children.length ? false : true;
};

FilterBuilder.prototype.end = function() {
	if (this.pointer.parent)
		this.pointer = this.pointer.parent;

	return this;
};

FilterBuilder.prototype.build = function() {
	return this.root ? this.root.toObject() : null;
};

/*var FB = new FilterBuilder('and');
FB.
	or().
		addFilter('is', {a: 1}).
		addFilter('is', {b: 2}).
		addFilter('is', {c: 3}).
	end().
	or().
		addFilter('is', {d: 4}).
		addFilter('is', {e: 5}).
		addFilter('is', {f: 6});*/

module.exports = {
	FilterBuilder: FilterBuilder,
	BuilderNode: BuilderNode
};
