var builderNode = require('../../utils/filterbuilder').BuilderNode;
var TelepatError = require('../../lib/TelepatError');
var chai = require('chai');
var expect = chai.expect;
var assert = chai.assert;
chai.should();
chai.use(require('chai-things'));

module.exports = function() {
	describe('FilterBuilder.BuilderNode', function() {
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
	});
}
