var lz4Module = require('lz4');
var stream = require('stream');
var async = require('async');

/**
 * Transform the object that is sent in the request body in the subscribe endpoint so its compatible with
 * the elasticsearch query object.
 * @param filterObject Object
 * @example
 * <pre>{
  "or": [
	{
	  "and": [
		{
		  "is": {
			"gender": "male",
			"age": 23
		  }
		},
		{
		  "range": {
			"experience": {
			  "gte": 1,
			  "lte": 6
			}
		  }
		}
	  ]
	},
	{
	  "and": [
		{
		  "like": {
			"image_url": "png",
			"website": "png"
		  }
		}
	  ]
	}
  ]
}</pre>
 */
var parseQueryObject = function(filterObject) {
	var objectKey = Object.keys(filterObject)[0];
	var result = {};
	result[objectKey] = [];

	for(var f in filterObject[objectKey]) {
		var filterObjectKey = Object.keys(filterObject[objectKey][f])[0];
		var filterType = null;

		if (filterObjectKey == 'and' || filterObjectKey == 'or') {
			result[objectKey].push(parseQueryObject(filterObject[objectKey][f]));
			continue;
		}

		switch(filterObjectKey) {
			case 'is': {
				filterType = 'term';
				break;
			}
			case 'like': {
				filterType = 'text';
				break;
			}
			default: {
				var otherFilters = {};
				otherFilters[filterObjectKey] = {};

				for(var prop in filterObject[objectKey][f][filterObjectKey]) {
					otherFilters[filterObjectKey][prop] = filterObject[objectKey][f][filterObjectKey][prop];
				}

				result[objectKey].push(otherFilters);
				continue;
			}
		}

		for(var prop in filterObject[objectKey][f][filterObjectKey]) {
			var p = {};
			p[filterType] = {};
			p[filterType][prop] = filterObject[objectKey][f][filterObjectKey][prop];
			result[objectKey].push(p);
		}
	}

	return result;
};

/**
 * Tests an object against a query object.
 * @param Object object Database item
 * @param Object query The simplified query object (not the elasticsearch one).
 * @returns {boolean}
 */
function testObject(object, query) {
	var mainOperator = Object.keys(query)[0];
	var result = null;

	if (mainOperator !== 'and' && mainOperator !== 'or')
		return false;

	for(var operand in query[mainOperator]) {
		var operator2 = Object.keys(query[mainOperator][operand])[0];

		switch(operator2) {
			case 'is': {
				for (var operand2 in query[mainOperator][operand][operator2]) {
					var partialResult = query[mainOperator][operand][operator2][operand2] === object[operand2];
					if (result === null) {
						result = partialResult;
					} else {
						if (mainOperator == 'and') {
							result &= partialResult;
						} else if (mainOperator == 'or') {
							result |= partialResult;
						}
					}
				}

				break;
			}

			case 'like': {
				for (operand2 in query[mainOperator][operand][operator2]) {
					partialResult =  object[operand2].toString().search(query[mainOperator][operand][operator2][operand2]) !== -1;
					if (result === null) {
						result = partialResult;
					} else {
						if (mainOperator == 'and') {
							result &= partialResult;
						} else if (mainOperator == 'or') {
							result |= partialResult;
						}
					}
				}

				break;
			}

			case 'range': {
				var prop = Object.keys(query[mainOperator][operand][operator2])[0];

				for (operand2 in query[mainOperator][operand][operator2][prop]) {
					partialResult =  null;

					if (object[prop] === undefined) {
						if (mainOperator == 'and') {
							result &= false;
						} else if (mainOperator == 'or') {
							result |= false;
						}

						continue;
					}

					switch(operand2) {
						case 'lte': {
							partialResult = query[mainOperator][operand][operator2][prop][operand2] >= object[prop];

							break;
						}
						case 'gte': {
							if (partialResult === null)
								partialResult = query[mainOperator][operand][operator2][prop][operand2] <= object[prop];
							else {
								if (mainOperator == 'and') {
									result &= partialResult;
								} else if (mainOperator == 'or') {
									result |= partialResult;
								}
							}

							break;
						}
						case 'lt': {
							if (partialResult === null)
								partialResult = query[mainOperator][operand][operator2][prop][operand2] > object[prop];
							else {
								if (mainOperator == 'and') {
									result &= partialResult;
								} else if (mainOperator == 'or') {
									result |= partialResult;
								}
							}

							break;
						}
						case 'gt': {
							if (partialResult === null)
								partialResult = query[mainOperator][operand][operator2][prop][operand2] < object[prop];
							else {
								if (mainOperator == 'and') {
									result &= partialResult;
								} else if (mainOperator == 'or') {
									result |= partialResult;
								}
							}

							break;
						}
					}

					if (result === null) {
						result = partialResult;
					} else {
						if (mainOperator == 'and') {
							result &= partialResult;
						} else if (mainOperator == 'or') {
							result |= partialResult;
						}
					}
				}

				break;
			}
		}
	}

	return Boolean(result);
}

var lz4 = (function() {

	/**
	 * @callback lz4ResultCb
	 * @param {Buffer} result The result of compression/decompression
	 */
	/**
	 * Only used internally to avoid code dupe
	 * @param {string|Buffer} data
	 * @param {int} operation 0 for compression, 1 for decompression
	 * @param {lz4ResultCb} callback
	 */
	var doWork = function(data, operation, callback) {
		var lz4Stream = null;

		if (operation == 0)
			lz4Stream = lz4Module.createEncoderStream();
		else if (operation == 1)
			lz4Stream = lz4Module.createDecoderStream();

		var outputStream = new stream.Writable();
		var result = new Buffer('');

		outputStream._write = function(chunk, encoding, callback1) {
			result = Buffer.concat([result, chunk]);
			callback1();
		};

		outputStream.on('finish', function() {
			callback(result);
		});

		var inputStream = new stream.Readable();
		inputStream.push(data);
		inputStream.push(null);

		inputStream.pipe(lz4Stream).pipe(outputStream);
	}

	return {
		/**
		 * LZ4 compress a string
		 * @param {string} string
		 * @param {lz4ResultCb} callback
		 */
		compress: function(string, callback) {
			doWork(string, 0, callback);
		},
		/**
		 * LZ4 decompress a string
		 * @param {Buffer} buffer
		 * @param {lz4ResultCb} callback
		 */
		decompress: function(buffer, callback) {
			doWork(buffer, 1, callback);
		}
	};
})();

var scanRedisKeysPattern = function(pattern, redisInstance, callback) {
	var redisScanCursor = -1;
	var results = [];

	var scanAndGet = function(callback1) {
		redisInstance.scan([redisScanCursor == -1 ? 0 : redisScanCursor,
			'MATCH', pattern, 'COUNT', 100000], function(err, partialResults) {
			if (err) return callback1(err);

			redisScanCursor = partialResults[0];
			results = results.concat(partialResults[1]);

			callback1();
		});
	};

	async.during(
		function(callback1) {
			callback1(null, redisScanCursor != 0);
		},
		scanAndGet,
		function(err) {
			callback(err, results);
		}
	);
};

//console.log(JSON.stringify(getQueryKey(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}'))));
//console.log(parseQueryObject(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}')));

module.exports = {
	parseQueryObject: parseQueryObject,
	testObject: testObject,
	scanRedisKeysPattern: scanRedisKeysPattern,
	lz4: lz4
};
