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
	if (typeof object != 'object')
		return false;

	if (typeof query != 'object')
		return false;

	var mainOperator = Object.keys(query)[0];

	if (mainOperator != 'and' && mainOperator != 'or')
		return false;

	var result = null;
	var partialResult = null

	function updateResult(result, partial) {
		//if result is not initialised, use the value of the operation
		//otherwise if it had a value from previous operations, combine the previous result with result from
		//	the current operation
		return result === null ? partialResult :(mainOperator == 'and') ? result && partialResult :
			result || partialResult;
	}

	for(var i in query[mainOperator]) {
		if (typeof query[mainOperator][i] != 'object')
			continue;

		var operation = Object.keys(query[mainOperator][i])[0];

		operationsLoop:
		for(var property in query[mainOperator][i][operation]) {
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
					for(var rangeOperator in query[mainOperator][i][operation][property]) {
						var objectPropValue = parseInt(object[property]);
						var queryPropValue = parseInt(query[mainOperator][i][operation][property][rangeOperator]);

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
					//console.log(query[mainOperator][i]);
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

//console.log(JSON.stringify(getQueryKey(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}'))));
//console.log(parseQueryObject(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}')));

module.exports = {
	parseQueryObject: parseQueryObject,
	getQueryKey: getQueryKey,
	testObject: testObject
};
