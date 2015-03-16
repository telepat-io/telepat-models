function Application(bucket, _id, cb) {

    var model = require('../models/Application.json');

    if (!model)
        throw new Error('Model spec file does not exist.');

    var _dbBucket = bucket;

    _dbBucket.get('blg.'+model.namespace+'.'+_id, (function(err, res) {
        var result = JSON.parse(res.value);

        for(var prop in this.model.properties) {
            if (this.model.properties.hasOwnProperty(prop)) {
                this[prop] = result[prop];
            }
        }

        cb(err, res);
    }).bind(this));
}

Application.prototype.get = function(key) {
    if (this.hasOwnProperty(key))
        return this[key];

    return undefined;
};


module.exports = Application;
