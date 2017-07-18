let TelepatError = require('../lib/TelepatError');
class BuilderNode {
    constructor(name) {
        if (!BuilderNode.CONNECTORS.includes(name))
            throw new TelepatError(TelepatError.errors.QueryError, [`unsupported query connector "${name}"`]);

        this.parent = null;
        /**
         *
         * @type {BuilderNode[]|Object[]}
         */
        this.children = [];
        this.name = name;
    }

    addFilter(name, value) {
        if (BuilderNode.FILTERS.includes(name)) {
            let filter = {};
            filter[name] = value;
            this.children.push(filter);
        } else
            throw new TelepatError(TelepatError.errors.QueryError, [`invalid filter "${name}"`]);
    }

    /**
     *
     * @param {BuilderNode} node
     */
    addNode(node) {
        node.parent = this;
        this.children.push(node);
    }

    /**
     *
     * @param {BuilderNode} node
     */
    removeNode(node) {
        let idx = this.children.indexOf(node);

        if (idx !== -1) {
            node.parent = null;
            return this.children.splice(idx, 1)[0];
        } else {
            return null;
        }
    }

    toObject() {
        let obj = {};
        obj[this.name] = [];

        this.children.forEach((item) => {
            if (item instanceof BuilderNode)
                obj[this.name].push(item.toObject());
            else
                obj[this.name].push(item);
        }, this);

        return obj;
    }
}

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

class FilterBuilder {
    constructor(initial) {
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
    }

    and() {
        if (this.root === null) {
            this.root = new BuilderNode('and');
        } else {
            let child = new BuilderNode('and');
            this.pointer.addNode(child);
            this.pointer = child;
        }

        return this;
    }

    or() {
        if (this.root === null) {
            this.root = new BuilderNode('or');
        } else {
            let child = new BuilderNode('or');
            this.pointer.addNode(child);
            this.pointer = child;
        }

        return this;
    }

    addFilter(name, value) {
        this.pointer.addFilter(name, value);

        return this;
    }

    removeNode() {
        if (this.root !== this.pointer) {
            let nodeToRemove = this.pointer;
            this.pointer = this.pointer.parent;

            return this.pointer.removeNode(nodeToRemove);
        } else
            return null;
    }

    isEmpty() {
        return this.root.children.length ? false : true;
    }

    end() {
        if (this.pointer.parent)
            this.pointer = this.pointer.parent;

        return this;
    }

    build() {
        return this.root ? this.root.toObject() : null;
    }
}

/*let FB = new FilterBuilder('and');
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
	FilterBuilder,
	BuilderNode
};
