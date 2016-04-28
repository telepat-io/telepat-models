# 0.4.0

* Major performance improvements
* AMQP messages are now compressed using LZ4
* TelepatIndexedLists is a data structure on redis used to rapidly search
for members
* Simpliefied the database adapter, now they can be used in bulk operations
* Device IDs are no longer stored in subscriptions, instead their tokens
are stored in order to avoid retrieving the device object everytime
* Filter builder is used by database adapters in order to form filters
for querying the database
* Moved some of the logic from the old adapter's functions to functions
in Admin/Context/Model/etc

# 0.3.0

* Performance fix: AMQP queues/exchanges are only asserted once
* Devices are created in an inactive keyspace. They should be activated
when a client connects to a volatile transport
* Implemented methods to activate/deactivate devices
* Performance fix: incresed maxSockets for ElasticSearch
* Performance fix: used agentKeepAlive for elasticSearch SDK
* Ability to connect to multiple ES nodes, or just one if you want to
use auto-discovery
* Messaging clients has the exclusive flag making them have one queue
per client
* Implemented offset/limit for some methods
* Implemented userMetadata use only by their respectiv owners
* Replaced syslog_logger with Winston
* Fixed a bug where updating objects with a field of type object would
make the operation to merge the fields instead of replacing the whole
object
* Implemented caching for count queries

# 0.2.8

* Bugfix: Channel.isValid when mask is invalid
* Bugfix: Channel when used with parent objects
* Bugfix: `applicationHasContext` in elasticSearch adapter returns false instead of an error in callback
* Bugfix: `modelCountByChannel` in elasticSearch adapter, context is optional
* Bugfix: `modelCountByChannel` should now work with filters
* `LoginProviderNotConfigured` error transformed into a more generic error `ServerNotConfigured`
* Added support for aggregating results in `modelCountByChannel`
* Added supoprt for object sort in `modelSearch`

# 0.2.7

* Fixed some bugs and crashes
* Redis keys are being scanned untill cursor returns 0
* Changed **email** property of user to **username**
* Added `ExpiredAuthorizationToken` error

# 0.2.6

* User.get can now be called with an object containing ID or email
* Fixed bug in AMQP message client which created unintended queues
* `applicationDeleteModelSchema` now deletes all model siblings
* Implemented `removeAllSubscriptionsFromDevice`
* Fixed handling of errors on Application.loadAllApllications
* Correct stack trace generation on TelepatError
* Subscription and Device keys now contain the applicationID in them
* Implemented `removeDevice`
* Implemented `TelepatLogger` used for logging purposes
	* `syslogger`
	* `console_logger`
* Fixed kafka/AzureSB crash

# 0.2.5

* Fixed various bugs
* 2 New message queue clients: **Azure ServiceBus** and **AMQP (RabbitMQ)**
* ElasticSearch should refresh its index on create/delete
* Configuration variables for ElasticSearch adapter get/subscribe result limit + paginated results for subscribe
* Model.countByChannel fixed
* Rewored how loadedAppModels work: every package should populate this at boot up. App.get loads from redis (cached)
* All message queue clients now have a broadcast method which broadcasts messages to all consumers on a channel/topic

# 0.2.4

* Standardized Errors with TelepatError object
* Implemented Delta.formPatches to more easily form patches from objects
* Moved messaging client from telepat-worker to telepat-models to be reusable by other components
* Added 'type' field to application, context and admin objects

# 0.2.3

* Replaced couchbase with elasticsearch through adapters
* Fixed many bugs
* Added email field to Deltas (used by user operations)
* Admin create throws 409 error when admin with that email address already exists
* Implemented admin.delete
* getDevices returns the corect error message when missing
* Implemented Delta.processObject which can be used by all update operations

# 0.2.2

* Release full of bug fixes

# 0.2.1

* Important performance issue fixed: all Models operations require context id when getting the object from database

# 0.2.0

* Implemented Channel and Delta classes to further separate code logic
* Added password field to user objects
* Fixed subscribe.remove and .add
* Fixed application schema keys
* Fixed device persistent udid key
* Return 404 error when unsubscribing with an invalid subscription

# 0.1.2

* Added LICENSE and README files
* get All Models and get All Contexts now return an array in the callback instead of hash map

# 0.1.0

* Initial Release
