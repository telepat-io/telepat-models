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
