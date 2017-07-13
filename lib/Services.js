'use strict';

let SystemMessageProcessor = require('./systemMessage');
const Services = {
    datasource: null,
    logger: null,
    messaginClient: null,
    redisClient: null
};

module.exports = Services;