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
					otherFilters[filterObjectKey]['doc.'+prop] = filterObject[objectKey][f][filterObjectKey][prop];
				}

				result[objectKey].push(otherFilters);
				continue;
			}
		}

		for(var prop in filterObject[objectKey][f][filterObjectKey]) {
			var p = {};
			p[filterType] = {};
			p[filterType]['doc.'+prop] = filterObject[objectKey][f][filterObjectKey][prop];
			result[objectKey].push(p);
		}
	}

	return result;
};

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

//console.log(JSON.stringify(getQueryKey(JSON.parse('{"or":[{"and":[{"is":{"gender":"male","age":23}},{"range":{"experience":{"gte":1,"lte":6}}}]},{"and":[{"like":{"image_url":"png","website":"png"}}]}]}'))));

module.exports = {
	parseQueryObject: parseQueryObject,
	getQueryKey: getQueryKey
};
