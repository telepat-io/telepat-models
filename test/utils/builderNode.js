var builderNode = require('../../utils/filterbuilder').BuilderNode;
var TelepatError = require('../../lib/TelepatError');
var chai = require('chai');
var expect = chai.expect;
var assert = chai.assert;
chai.should();
chai.use(require('chai-things'));

module.exports = function() {
	describe('BuilderNode', function() {
		after(afterTest);

		it('Should throw an error because connector is not valid', function(done) {
			try {
				var bn = new builderNode('wtf');
				assert.fail(undefined, TelepatError, 'Expected builderNode constructor to throw error');
			} catch (e) {
				if (e instanceof TelepatError) {
						expect(e).to.have.property('code', '048');
				} else {
					throw e;
				}

				try {
					var bn1 = new builderNode();
					assert.fail(undefined, TelepatError, 'Expected builderNode constructor to throw error');
				} catch (e1) {
					if (e1 instanceof TelepatError) {
						expect(e1).to.have.property('code', '048');
					} else {
						throw e;
					}
				}
			}

			done();
		});

		it('Should have an empty builder with a valid connector', function(done) {
			try {
				var bn1 = new builderNode('and');
				var bn2 = new builderNode('or');

				expect(bn1).to.have.property('parent', null);
				expect(bn1).to.have.property('name', 'and');
				expect(bn1.children).to.have.length(0);
				expect(bn2).to.have.property('parent', null);
				expect(bn2).to.have.property('name', 'or');
				expect(bn2.children).to.have.length(0);
			} catch (e) {
				if (e instanceof TelepatError){
					assert.fail(e, undefined, 'Expected builderNode constructor to not throw error: ' + e);
				} else {
					throw e;
				}
			}

			done();
		});

		it('Should throw an error because trying to add invalid filter', function(done) {
			try {
				var bn1 = new builderNode('and');
				bn1.addFilter('qwop');
				assert.fail(undefined, TelepatError, 'Expected buildNode.addFilter to throw error');
			} catch (e) {
				expect(e).to.be.instanceof(TelepatError);
				expect(e).to.have.property('code', '048');

				try {
					bn1 = new builderNode('and');
					bn1.addFilter('is');
					assert.fail(undefined, TelepatError, 'Expected buildNode.addFilter to throw error');
				} catch (e1) {
					expect(e1).to.be.instanceof(TelepatError);
					expect(e1).to.have.property('code', '048');
				}

			}

			done();
		});

		it('Should throw an error because trying to add invalid value', function(done) {
			try {
				var bn1 = new builderNode('and');
				bn1.addFilter('is', {object: true});
				assert.fail(undefined, TelepatError, 'Expected buildNode.addFilter to throw error');
			} catch (e) {
				expect(e).to.be.instanceof(TelepatError);
				expect(e).to.have.property('code', '048');

				try {
					bn1 = new builderNode('and');
					bn1.addFilter('range', 'wut');
					assert.fail(undefined, TelepatError, 'Expected buildNode.addFilter to throw error');
				} catch (e1) {
					expect(e1).to.be.instanceof(TelepatError);
					expect(e1).to.have.property('code', '048');
				}

			}

			done();
		});

		it('Should add all supported filters to builder', function(done) {
			try {
				var bn1 = new builderNode('and'),
					filters = [
					{
						is: 'test'
					},
					{
						not: {is: 'test'}
					},
					{
						exists: 'test'
					},
					{
						range: {gte: 0, lte: 1}
					},
					{
						in_array: 'test'
					},
					{
						like: 'test'
					}
				];

				filters.forEach(function(f) {
					var name = Object.keys(f)[0];
					bn1.addFilter(name, f[name]);
				});

				expect(bn1.children).to.deep.equal(filters);

			} catch (e) {
				if (e instanceof TelepatError){
					assert.fail(e, undefined, 'Expected builderNode.addFilter to not throw error: ' + e);
				} else {
					throw e;
				}
			}

			done();
		});

		it('Should fail adding a node because argument is not instanceof BuilderNode', function(done) {
			try {
				var bn1 = new builderNode('and');
				bn1.addNode('string');
				assert.fail(undefined, TelepatError, 'Expected builderNode.addNode to throw error');
			} catch (e) {
				expect(e).to.be.instanceof(TelepatError);
				expect(e).to.have.property('code', '002');
			}

			done();
		});

		it('Should add a valid builderNode', function(done) {
			try {
				var bn1 = new builderNode('and');
				var bn2 = new builderNode('or');

				bn1.addNode(bn2);

				expect(bn1.children).to.have.length(1);
				expect(bn2.parent).to.be.instanceof(builderNode);
				expect(bn2.parent).to.have.property('name', 'and');
			} catch (e) {
				if (e instanceof TelepatError){
					assert.fail(e, undefined, 'Expected builderNode constructor to not throw error: ' + e);
				} else {
					throw e;
				}
			}

			done();
		});

		it('Should fail removing a node because argument is not instanceof BuilderNode', function(done) {
			try {
				var bn1 = new builderNode('and');
				bn1.removeNode('string');
				assert.fail(undefined, TelepatError, 'Expected builderNode.addNode to throw error');
			} catch (e) {
				expect(e).to.be.instanceof(TelepatError);
				expect(e).to.have.property('code', '002');
			}

			done();
		});

		it('Should remove a valid builderNode', function(done) {
			try {
				var bn1 = new builderNode('and');
				var bn2 = new builderNode('or');

				bn1.addNode(bn2);

				var result = bn1.removeNode(bn2);

				expect(bn1.children).to.have.length(0);
				expect(bn2.parent).to.be.equal(null);
				expect(result).to.be.instanceof(builderNode);
				expect(result).to.have.property('name', 'or');
			} catch (e) {
				if (e instanceof TelepatError){
					assert.fail(e, undefined, 'Expected builderNode constructor to not throw error: ' + e);
				} else {
					throw e;
				}
			}

			done();
		});
	});
}
