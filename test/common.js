exports.config = {
	ElasticSearch1: {
		host: "localhost",
		port: 9200,
		index: "default"
	},
	ElasticSearch2: {
		hosts: ["localhost:9200"],
		index: "default"
	}
};
