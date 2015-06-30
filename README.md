# Telepat Models Library

This package is used by the [Telepat API](https://github.com/telepat-io/telepat-api) and the [Telepat Worker](https://github.com/telepat-io/telepat-worker).

It contains the necessary functions and methods of accessing the database (through couchbase & elasticsearch).

* `Admin.js`: Contains methods for handling admin objects from the database
* `Application.js`: Each server can have many applications. An application object can be used through methods contained in this file.
* `Context.js`: Application objects live in contexts which are just simple containers with a determined lifetime.
* `Model.js`: The methods in this file handle all the application's objects. One model reperesents one type of object.
Each application has a schema where models are defined.
* `Subscription.js`: These methods handles subscriptions and devices
* `User.js`: These methods handle user objects
