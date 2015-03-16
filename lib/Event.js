var cb = require('couchbase');

/**
 *
 * @param bucket
 * @param _id
 * @param cb
 * @constructor
 * @property {number} id
 * @property {number} created
 * @property {number} modified
 * @property {number} text
 * @property {string} image
 * @property {object} options
 * @property {object} answers
 * @property {number} comments_count
 */
function Event(bucket, _id, cb) {

    var _model = require('../models/Event.json');

    if (!_model)
        throw new Error('Model spec file does not exist.');

    var _dbBucket = bucket;

    _dbBucket.get('blg.'+_model.namespace+'.'+_id, (function(err, res) {
        var result = JSON.parse(res.value);

        for(var prop in this.model.properties) {
            if (this.model.properties.hasOwnProperty(prop)) {
                this[prop] = result[prop];
            }
        }

        for(var rel in this.model.relations) {
            if (this.model.relations.hasOwnProperty(rel)) {
                this.prototype['getAll'+this.model.relations[rel].to] = function(filter, cb) {
                    var view = cb.ViewQuery.from('events', this.model.relations[rel].to.toLowerCase()+'_on_event').key(this.id);
                    this._dbBucket.query(view, cb);
                }
            }
        }

        cb(err, res);
    }).bind(this));

}

module.exports = Event;