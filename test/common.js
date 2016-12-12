exports.config = {
	ElasticSearch1: {
		host: '192.168.48.129:9200',
		index: 'default_testing',
		apiVersion: '1.7'
	},
	ElasticSearch2: {
		hosts: ['192.168.48.129:9200'],
		index: 'default_testing',
		apiVersion: '1.7'
	},
	esIndexCreate: {
		mappings: {
			_default_: {
				dynamic_templates: [
					{
						geolocation_template: {
							mapping: {
								type: 'geo_point'
							},
							match: '*_geolocation',
							match_mappping_type: 'geo_point'
						}
					},
					{
						string_template: {
							mapping: {
								index: 'not_analyzed',
								type: 'string'
							},
							match: '*',
							match_mapping_type: 'string'
						}
					},
					{
						object_template: {
							mapping: {
								index: 'not_analyzed',
								type: 'object'
							},
							match: '*',
							match_mapping_type: 'object'
						}
					}
				]
			}
		},
		settings: {
			index: {
				number_of_replicas: 0,
				number_of_shards: 1
			}
		}
	}
};
