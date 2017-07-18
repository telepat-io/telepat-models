const lz4Module = require('lz4');
const stream = require('stream');
const async = require('async');
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
let parseQueryObject = filterObject => {
	let objectKey = Object.keys(filterObject)[0];
	let result = {};
	result[objectKey] = [];

	for(let f in filterObject[objectKey]) {
		let filterObjectKey = Object.keys(filterObject[objectKey][f])[0];
		let filterType = null;

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
				let otherFilters = {};
				otherFilters[filterObjectKey] = {};

				for(let prop in filterObject[objectKey][f][filterObjectKey]) {
					otherFilters[filterObjectKey][prop] = filterObject[objectKey][f][filterObjectKey][prop];
				}

				result[objectKey].push(otherFilters);
				continue;
			}
		}

		for(let prop in filterObject[objectKey][f][filterObjectKey]) {
			let p = {};
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
	if (typeof object != 'object')
		return false;

	if (typeof query != 'object')
		return false;

	let mainOperator = Object.keys(query)[0];

	if (mainOperator != 'and' && mainOperator != 'or')
		return false;

	let result = null;
	let partialResult = null

	function updateResult(result, partial) {
		//if result is not initialised, use the value of the operation
		//otherwise if it had a value from previous operations, combine the previous result with result from
		//	the current operation
		return result === null ? partialResult :(mainOperator == 'and') ? result && partialResult :
		result || partialResult;
	}

	for(let i in query[mainOperator]) {
		if (typeof query[mainOperator][i] != 'object')
			continue;

		let operation = Object.keys(query[mainOperator][i])[0];

		operationsLoop:
			for(let property in query[mainOperator][i][operation]) {
				switch(operation) {
					case 'is': {
						partialResult = object[property] == query[mainOperator][i][operation][property];

						break;
					}

					case 'like': {
						partialResult = object[property].toString().search(query[mainOperator][i][operation][property]) !== -1;

						break;
					}

					case 'range': {
						if (typeof query[mainOperator][i][operation][operation][property] != 'object')
							continue;

						rangeQueryLoop:
							for(let rangeOperator in query[mainOperator][i][operation][property]) {
								let objectPropValue = parseInt(object[property]);
								let queryPropValue = parseInt(query[mainOperator][i][operation][property][rangeOperator]);

								switch(rangeOperator) {
									case 'gte': {
										partialResult = objectPropValue >= queryPropValue;

										break;
									}

									case 'gt': {
										partialResult = objectPropValue > queryPropValue;

										break;
									}

									case 'lte': {
										partialResult = objectPropValue <= queryPropValue;

										break;
									}

									case 'lt': {
										partialResult = objectPropValue < queryPropValue;

										break;
									}

									default: {
										continue rangeQueryLoop;
									}
								}

								result = updateResult(result, partialResult);
							}

						break;
					}

					case 'or':
					case 'and': {
						partialResult = testObject(object, query[mainOperator][i]);

						break;
					}

					default: {
						continue operationsLoop;
					}
				}

				result = updateResult(result, partialResult);
			}
	}

	return !!result;
}

let lz4 = ((() => {

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
	let doWork = (data, operation, callback) => {
		let lz4Stream = null;

		if (operation == 0)
			lz4Stream = lz4Module.createEncoderStream();
		else if (operation == 1)
			lz4Stream = lz4Module.createDecoderStream();

		let outputStream = new stream.Writable();
		let result = new Buffer('');

		outputStream._write = (chunk, encoding, callback1) => {
			result = Buffer.concat([result, chunk]);
			callback1();
		};

		outputStream.on('finish', () => {
			callback(result);
		});

		let inputStream = new stream.Readable();
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
		compress(string, callback) {
			doWork(string, 0, callback);
		},
		/**
		 * LZ4 decompress a string
		 * @param {Buffer} buffer
		 * @param {lz4ResultCb} callback
		 */
		decompress(buffer, callback) {
			doWork(buffer, 1, callback);
		}
	};
}))();

let scanRedisKeysPattern = (pattern, redisInstance, callback) => {
	let redisScanCursor = -1;
	let results = [];

	let scanAndGet = callback1 => {
		redisInstance.scan([redisScanCursor == -1 ? 0 : redisScanCursor,
			'MATCH', pattern, 'COUNT', 100000], (err, partialResults) => {
			if (err) return callback1(err);

			redisScanCursor = partialResults[0];
			results = results.concat(partialResults[1]);

			callback1();
		});
	};

	async.during(
		callback1 => {
			callback1(null, redisScanCursor != 0);
		},
		scanAndGet,
		err => {
			callback(err, results);
		}
	);
};

//console.log(JSON.stringify(getQueryKey(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}'))));
//console.log(parseQueryObject(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}')));

module.exports =  {
	parseQueryObject,
	testObject,
	scanRedisKeysPattern,
	lz4
};
