'use strict';
let Services = new Proxy({
    datasource:null,
    logger:null, 
    messaginClient: null,
    redisClient: null
},{
    get: (object, prop) => {
        console.log(prop, typeof object[prop]);
        if(typeof object[prop] == 'undefined') {
            return object.datasource.dataStorage[prop];
        }
        return object[prop];
    }
});

module.exports = Services;