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
 * Parses the query filter object to form the key of the filter of the subscription document inserted in the state
 * bucket.
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
 @example output
 <pre>((gender=male&&age=23)&&(experience<=6&&experience>=1))||((image_url~png&&website~png))</pre>

 */
var getQueryKey = function(filterObject) {
	var objectKey = Object.keys(filterObject)[0];
	var result = '';
	var mainOperator = '';

	switch(objectKey) {
		case 'and': {
			mainOperator = '&&';
			break;
		}
		case 'or': {
			mainOperator = '||';
			break;
		}
	}

	for(var f in filterObject[objectKey]) {
		var filterObjectKey = Object.keys(filterObject[objectKey][f])[0];

		if (filterObjectKey == 'and' || filterObjectKey == 'or') {
			result += '('+getQueryKey(filterObject[objectKey][f])+')'+mainOperator;
			continue;
		}

		var operator = '';

		switch(filterObjectKey) {
			case 'is': {
				operator = '=';

				break;
			}
			case 'like': {
				operator = '~';

				break;
			}
			default: {

			}
		}

		result += '(';
		for(var t in filterObject[objectKey][f][filterObjectKey]) {
			if (filterObjectKey == 'range') {
				if (filterObject[objectKey][f][filterObjectKey][t]['lte'] !== undefined) {
					result += t+'<='+filterObject[objectKey][f][filterObjectKey][t]['lte']+'&&';
				} else if (filterObject[objectKey][f][filterObjectKey][t]['lt'] !== undefined) {
					result += t+'<'+filterObject[objectKey][f][filterObjectKey][t]['te']+'&&';
				}

				if (filterObject[objectKey][f][filterObjectKey][t]['gte'] !== undefined) {
					result += t+'>='+filterObject[objectKey][f][filterObjectKey][t]['gte']+'&&';
				} else if (filterObject[objectKey][f][filterObjectKey][t]['gt'] !== undefined) {
					result += t + '>' + filterObject[objectKey][f][filterObjectKey][t]['gt']+'&&';
				}

			} else {
				result += t+operator+filterObject[objectKey][f][filterObjectKey][t]+mainOperator;
			}
		}

		result = result.slice(0, -mainOperator.length);
		result += ')'+mainOperator;
	}

	return result.slice(0, -mainOperator.length);
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



//console.log(JSON.stringify(getQueryKey(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}'))));
//console.log(parseQueryObject(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}')));

module.exports = {
	parseQueryObject: parseQueryObject,
	getQueryKey: getQueryKey,
	testObject: testObject
};
