# Telepat Models Library

This package is used by the [Telepat API](https://github.com/telepat-io/telepat-api) and the [Telepat Worker](https://github.com/telepat-io/telepat-worker).

This package contains the libraries for using various telepat resources:

* Databases:
	* At the moment only elasticSearch support is implemented (version 1.7.x). Configuration variables:
		* `TP_ES_HOST`: Elasticsearch server:port. This option will use autodiscovery.
		* `TP_ES_HOSTS`: server1:port,server2:port. This option will not use autodiscovery.
        * `TP_ES_INDEX`: Elasticsearch index
        * `TP_ES_SUBSCRIBE_LIMIT` (optional): How many results the modelSearch method (used in subscriptions) should return (paginated). Default 64.
        * `TP_ES_GET_LIMIT` (optional): How many resutls every other search methods should return (not paginated, fixed). Default 384.
	* The state database doesn't use the adapter model yet because it's locked to Redis. Only `Subscription.js` uses it.
		* `TP_REDIS_HOST`: Redis server
        * `TP_REDIS_PORT`: Redis server port

* Messaging Systems:
	* Apache Kafka
		* `TP_KFK_HOST`: Kafka (zooekeeper) server
        * `TP_KFK_PORT`: Kafka (zooekeeper) server port
	* Azure ServiceBus
		* `TP_AZURESB_CONNECTION_STRING`: Azure SB connection string
		* `TP_AZURESB_MSG_POLLING`: How fast should the messaging server be polled (in milliseconds)
	* AMQP: we've tested it with RabbitMQ 3.5.5
		* `TP_AMQP_HOST`: AMQP server host
		* `TP_AMQP_USER`: AMQP user used by Telepat
		* `TP_AMQP_PASSWORD`: The password for the user

* Loggers:
	* We use winston logger: [Winston](https://github.com/winstonjs/winston)
	* `TP_LOGGER`: the name of the Winston logger (eg.: Console)
	* `TP_LOG_LEVEL`: logging level
