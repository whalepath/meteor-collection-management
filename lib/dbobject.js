/**
 * IMPORTANT: This is the base class for all objects stored permanently.
 * (There maybe objects stored in temporary collections for client/server interaction)
 *
 * This class:
 * 1. Defines the base methods needed to support EJSON. (which is used to send / receive files )
 * 2. Defines the EJSON type
 * 3. Handles serialize/deserialize with JSON.
 *
 * TODO: Allow for sensitive fields to be stripped when sending to client.
 *
 * Preferred:
<SubClass> = DbObjectType.createSubClass('typename', [ propertyNames ... ], 'collectionName');

OR (only if a custom ordering is needed):
 
 <SubClass> = function() {
    DbObjectType.apply(this, arguments);
};
 DbObjectType.createSubClass(<SubClass>, 'typename', [ propertyNames ... ], 'collectionName');
 
NOTE: when setting an explicit id on object creation, the special property '_newId' must be set not _id.
 *
 */
DbObjectType = function(propertyValues){
    var that = this;
    // TODO: need to handle propertyNamesClientCanSet filtering when loading new data.
    if ( arguments.length == 1 && arguments[0] instanceof Object) {
        this.fromJSONValue(arguments[0]);
        
        // if no id currently, *and* a specific id is requested, then copy the specific id
        // note that _newId is not a property per se - it only exists for a brief while.
        // note that this means that the client can not set _newId ( as it will not be included in the generated json )
        if ( this._id == null && propertyValues._newId ) {
            // make sure that any numerics get convert to string ids (required by mongo)
            this._newId = propertyValues._newId +"";
        }
    }
    if ( this.createdAt == null ) {
        this.createdAt = new Date();
    }
    this._makePropertyImmutable('createdAt');
    // HACK SECURITY these properties must only be set on the server : any values from client are suspect
    // createdAt / _id : need to be protected.
    if ( this._id != null) {
        // safety: once the database _id is set don't allow it to be changed.
        this._makePropertyImmutable('_id');
    }
};

/**
 * IMPORTANT: The subclass's prototype can only be extended *AFTER* this method is called.
 *
 * If the propertyNamesParam contains a property named 'propertyName' with 'reference' field set to 'true' then the generated collection has 2 additional methods:
 *    * findOneByPropertyName - returns a single object referenced by the propertyName
 *    * findByPropertyName -
 *          1. primary use is on server side when returning a cursor in a pub/sub
 *          2. or if multiple objects can be returned.
 *    Example: { 'humanId' : { reference: true }}, for such definition methods 'findOneByHumanId' and 'findByHumanId' will be created.
 *
 * REFERENCING
 * By default a property with a name ending in 'Id' or 'Ids' is a reference property. All reference properties are indexed.
 *
 * INDEXING
 * For properties with 'reference' or 'indexed' option set to 'true' an ascending index is created:
 *
 *   ['normal', {'idxProp': {indexed: true}}, {'refProp' : {reference: true}}]
 *
 * PropertyNamesParam array shown in the example will result in 2 indexes created: one for 'idxProp' and another for 'refProp'.
 *
 *
 * @param subClassType optional constructor function - only supply if need extra special constructor behavior. subclass initialization can happen in a ctor function defined by the subclass.
 * @param typeName required string
 * @param propertyNamesParam - declare the properties that the EJSON code will care about. can be array of strings (or objects, or strings AND objects) or can be an object that
 * will be passed to Object.defineProperties. If any value in the key/value pairs is null, then a standard definition will be supplied of : { writable: true }
 * @param databaseTableName -- NOTE: To avoid inadvertantly accidentally changing the database table names ( very! bad! )
 * pass in the databaseTableName as a separate string
 * @returns {*} the constructor function
 */
DbObjectType.createSubClass = function(subClassTypeParam, typeNameParam, propertyNamesParam, databaseTableNameParam, extensionsParam) {
    var subClassType, typeName;
    // SECURITY these properties must only be set on the server : any values from client are suspect
    var propertyNames = ['_id', 'createdAt' ];
    var databaseTableName, extensions;
    var argumentIndex = 0;
    // if the first argument is not the constructor function then shift arguments
    if ( typeof subClassTypeParam != "function" ) {
        subClassType = function() {
            DbObjectType.apply(this, arguments);
            if ( typeof this.ctor === 'function' ) {
                this.ctor.apply(this, arguments);
            }
        };
    } else {
        subClassType = subClassTypeParam;
        argumentIndex++;
    }
    typeName = arguments[argumentIndex++];
    var propertyNamesArg = arguments[argumentIndex++] || [];
    var properties = {};
    var referenceProperties = [];
    var indexedProperties = [];
    // properties that the client is allowed to set.
    // this will be used to filter out properties such as '_id', 'id', or any properties with a name that ends in 'Id' or Ids
    // these properties should not be set by the client.
    var propertyNamesClientCanSet = [];
    function processPropertyDefinitions(propertiesObject) {
        // Property definitions which are not writable should not be
        // added to propertyNamesClientCanSet.
        function isPropertyDefinitionWritable(property) {
            return property['writable'] == true || 'set' in property;
        }

        _.each(propertiesObject, function(propertyDefinition, propertyName) {
            property = properties[propertyName] = propertyDefinition || { writable: true };
            if (!_.has(property, 'writable') && !_.has(property, 'get') && !_.has(property, 'set')) {
                // necessary in part because a property definition that is just an empty object ( i.e. 'name:{}' ) results in a property that is not writable.
                property['writable'] = true;
            }
            if ( !('security' in property)) {
                // not explicitly marked as secure property. heuristics apply
                if (!('reference' in property)) {
                    var propertyNameLen = propertyName.length;
                    if ( propertyName.substring(propertyNameLen-2) !== 'Id' && propertyName.substring(propertyNameLen-3) !== 'Ids') {
                        // exclude properties ending in 'Id' or 'Ids'
                        if(isPropertyDefinitionWritable(propertyDefinition)) {
                            propertyNamesClientCanSet.push(propertyName);
                        }
                    } else {
                        // By default propertyNames ending in 'Id' or 'Ids' are reference properties.
                        property.reference = true;
                    }
                } else if ( property.reference === false) {
                    // explicitly not a reference and the security value is false or undefined.
                    if(isPropertyDefinitionWritable(propertyDefinition)) {
                        propertyNamesClientCanSet.push(propertyName);
                    }
                }
            } else if ( property.security === false) {
                // explicitly safe.
                if(isPropertyDefinitionWritable(propertyDefinition)) {
                    propertyNamesClientCanSet.push(propertyName);
                }
            } 
            if (property.reference) {
                referenceProperties.push(propertyName);
            }
            if (property.reference || property.indexed) {
                indexedProperties.push(propertyName);
            }
            propertyNames.push(propertyName);
        });
    }
    if ( _.isArray(propertyNamesArg ) ) {
        _.each(propertyNamesArg, function(propertyNameOrDefinition) {
            if ( typeof propertyNameOrDefinition === 'string' ) {
                var propertyDefinition = {};
                propertyDefinition[propertyNameOrDefinition] = {};
                processPropertyDefinitions(propertyDefinition);
            } else if (propertyNameOrDefinition != null) {
                processPropertyDefinitions(propertyNameOrDefinition);
            }
        });
    } else {
        processPropertyDefinitions(propertyNamesArg);
    }
    databaseTableName = arguments[argumentIndex++];
    extensions = arguments[argumentIndex++];

    // make the subClassType extend DbObjectType.prototype 
    // NOTE: this means that any previous code to extend the subClassType.prototype will be lost
    _.extend(properties, {
        propertyNames: {
            writable :false,
            value : propertyNames
        },
        propertyNamesClientCanSet : {
            writable :false,
            value : propertyNamesClientCanSet
        },
        // so that we have the typename easily available for debug output
        typeName: {
            writable : false,
            value : typeName
        },
        id: {
            get : function() {
                return this._id;
            }
        }
    });
    subClassType.prototype = Object.create(DbObjectType.prototype, properties);
    subClassType.prototype.constructor = subClassType;
    if ( extensions != null ) {
        if ( typeof extensions == "function" ) {
            _.extend(subClassType.prototype, extensions());
        } else {
            _.extend(subClassType.prototype, extensions);
        }
    }

    EJSON.addType(typeName, function(rawJson) {
        // TODO : security : need to hash _id, createdAt and any other immutables + secret salt to make sure that immutables are not changed.
        // this is a little awkward because sometimes deserializing from db, sometimes from client: when deserializing from db different params are allowed?

        var object = new subClassType(rawJson);
        return object;
    });

    // create database table if needed
    if ( databaseTableName ) {
        var dbCollection = new Meteor.Collection(databaseTableName, {
            transform: function(doc) {
                return new subClassType.prototype.constructor(doc);
            }
        });

        // make available both on the prototype (so this.databaseTable works)
        subClassType.prototype.databaseTable = dbCollection;
        // .. and the more statically accessed method HumanResearcher.databaseTable
        // both have their conveniences.
        subClassType.databaseTable = dbCollection;
        // TODO: just add this to Meteor.collections base class?
        _.extend(subClassType.databaseTable, {
            // TODO: fold this into the general referenceProperties method generation that follows.
            findById: function(id) {
                if ( id == null ) {
                    // remember typeof null === 'object'
                    return null;
                } else if ( typeof id ==='number' ) {
                    return this.find({_id:""+id});
                } else if ( typeof id === 'string' || typeof id ==='object' ) {
                    // allows for a more involved condition (i.e. {$in:['1','1']}
                    return this.find({_id:id});
                } else {
                    return null;
                }
            },
            // TODO: fold this into the general referenceProperties method generation that follows.
            findOneById: function(id) {
                var cursor = this.findById(id);
                if ( cursor ) {
                    return cursor.fetch()[0];
                } else {
                    return null;
                }
            },
            /**
             * find().fetch()
             */
            findFetch: function() {
                var cursor = this.find.apply(this, arguments);
                if ( cursor ) {
                    return cursor.fetch();
                } else {
                    return null;
                }
            },
            findOneBy: function(propertyName, value) {
                if ( value ) {
                    var request = {};
                    request[propertyName] = value;
                    return this.findOne(request);
                } else {
                    return null;
                }
            },
            findBy: function(propertyName, value) {
                if ( value ) {
                    var request = {};
                    request[propertyName] = value;
                    return this.find(request);
                } else {
                    return null;
                }
            }
        });
        for (var i in referenceProperties) {
            var propertyName = referenceProperties[i];
            var propertyNameCapitalized = propertyName.substring(0,1).toUpperCase() + propertyName.substring(1);
            var methodName = 'findOneBy' + propertyNameCapitalized;
            dbCollection[methodName] = dbCollection.findOneBy.bind(dbCollection, propertyName);
            methodName = 'findBy' + propertyNameCapitalized;
            dbCollection[methodName] = dbCollection.findBy.bind(dbCollection, propertyName);
        }
        if ( Meteor.isServer) {
            // mini mongo doesn't have info about the mongo collection.
            // NOTE: NOTE: this code was written based on : http://stackoverflow.com/questions/18520567/average-aggregation-queries-in-meteor/18884223#18884223
            // This code works as of Meteor 0.8.2 BUT may not work in future because of reference to MongoInternals
            _.extend(subClassType.databaseTable, {
                /**
                 * Used when we need to get direct access to the mongo db collection using methods that
                 * that meteor does not directly support. For example, aggregate functions.
                 * @returns The raw mongo db object
                 */
                getMongoDbCollection: function () {
                    var db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
                    var dbCollection = db.collection(databaseTableName);
                    return dbCollection;
                },
                /**
                 * TODO: This has not been tested yet.
                 * If used directly in server or as part of a Meteor.method() then we will need
                 * to do a http://stackoverflow.com/questions/13190328/meteorjs-async-code-inside-synchronous-meteor-methods-function
                 * also https://www.eventedmind.com/tracks/feed-archive/meteor-meteor-wrapasync
                 * @param pipeline - must be array of single object.
                 * @param callbackFn - this function adds each aggregation result to the cursor
                 * @param completeFn - this function calls the self.ready() on the cursor
                 * @returns {*}
                 */
                aggregate: function (pipeline, callbackFn, completeFn) {
//                    var wrappedAsyncFn = Meteor._wrapAsync(this.aggregateCursor);
//                    var results = wrappedAsyncFn(pipeline, callbackFn, completeFn);
//                    return results;
                    throw new Meteor.Error("Need to implement");
                },
                /**
                 * Used when replying to a client with the results. This allows us to keep the mongodb code
                 * asynchronous.
                 * @param pipeline
                 * @param callbackFn
                 * @param completeFn
                 */
                aggregateCursor: function (pipeline, callbackFn, completeFn) {
                    var boundCallback = Meteor.bindEnvironment(function(error, result) {
                        if ( error == null ) {
                            // Note: you will not be able to step into this function or set breakpoints on it.
                            // fiber runs in native code.
//                            console.log("aggregate Processing results");

                            _.each(result, callbackFn);
                            if (typeof completeFn === 'function') {
                                completeFn();
                            }
                        } else {
                            throw new Meteor.Error(500, error.toString());
                        }
                    });
                    var dbCollection = this.getMongoDbCollection();
                    dbCollection.aggregate(pipeline, boundCallback);
                }
            });
            //Mini mongo doesn't support indexes, so only doing this on server.
            for (var i in indexedProperties) {
                var propertyName = indexedProperties[i];
                var index = {};
                index[propertyName] = 1;
                var opts = { name: 'idx_asc_' + propertyName};
                subClassType.databaseTable._ensureIndex(index, opts);
            }
        }
    }
    return subClassType;
};

DbObjectType.prototype = {
    constructor : DbObjectType,
    clone : function() {
        var cloned = new this.constructor(this);
        return cloned;
    },
    equals : function(other) {
        if (!(other instanceof this.constructor)) {
            return false;
        } else if (this._id !== other._id) {
            return false;
        } else {
            return EJSON.stringify(this) === EJSON.stringify(other);
        }
    },
    // Properties preserved by this method are properties which go
    // into the db. This includes non-writeable properties.
    toJSONValue: function() {
        var that = this;
        var result = {};
        this.propertyNames.forEach(function(propertyName) {
            if ( typeof(that[propertyName]) !== "undefined") {
                result[propertyName] = that[propertyName];
            }
        });
        return result;
    },
    fromJSONValue: function(rawJson) {
        var that = this;
        this.propertyNames.forEach(function(propertyName) {
            if ( typeof(rawJson[propertyName]) !== "undefined") {
                that[propertyName] = rawJson[propertyName];
            }
        });
        return this;
    },
    toString : function() {
        return EJSON.stringify(this);
    },
    pickClient: function(clientObject) {
        return _.pick(clientObject, this.propertyNamesClientCanSet);
    },
    extendClient: function(clientObject) {
        return _.extend(this, this.pickClient(clientObject));
    },
    // look for keys that will be ignored
    checkKeys: function(object) {
        _.onlyKeysCheck(object, null, this.propertyNames);
    },
    /**
     * our standard save method.
     * @private
     */
    _save: function() {
        // allow the id to be supplied explicitly when creating a new record
        var _newId;
        if ( this._newId ) {
            // meteor requires that ids be strings. Just in case a number was used, make sure it is converted to a string
            _newId = ""+this._newId; 
            delete this._newId;
        }
        // TODO: I had problems with upsert (don't remember exactly what they were)
        try {
            _.onlyKeysCheck(this, null, this.propertyNames);
        } catch(e){
            console.log("While saving a db record:"+ e.message);
        }
        if ( this._id ) {
            this.databaseTable.update({_id: this._id}, this.toJSONValue());
        } else {
            var jsonValue = this.toJSONValue();
            if ( _newId ) {
                jsonValue._id = _newId; 
            }
            var _id = this.databaseTable.insert(jsonValue);
            this._id = _id;
            this._makePropertyImmutable('_id');
        }
        return this;
    },
    _makePropertyImmutable: function(propertyName) {
        Object.defineProperty(this, propertyName,
            {
                writable: false,
                configurable: false,
            }
        );
    },
    /* Perform an upsert-like operation from an untrusted client,
     * checking some conditions. Updates only one object, not all
     * objects matching lookup.
     *
     * @param clientObj non-null object to update from.
     * @param lookup (optional) mongodb query to find existing object. default={_id: clientObj._id}.
     * @param forcedValues (optional) values which must be present in the client.
     */
    upsertFromUntrusted: function(clientObj, lookup, forcedValues) {
        // No way to locate target or insert.
        if ( clientObj == null && lookup == null ) {
            return this;
        }

        // This doesn't specify any modification or requirement. It's basically just find.
        if ( clientObj == null && forcedValues == null ) {
            return this;
        }

        // The object to update (or insert if set to null).
        var target = null;

        // If the user doesn't supply lookup params, still try to
        // do _id lookup.
        if ( lookup == null && clientObj != null && _.has(clientObj, '_id') ) {
            lookup = { _id: clientObj._id };
        }

        if ( lookup != null) {
            // XXX we want to update either 0 or 1 objects, and ensure
            // this by doing findOne. Should we also check that find()
            // only returns one object, else throw exception?
            target = this.databaseTable.findOne(lookup);
        }

        // This happens when
        //
        // 1. client sends new object with no lookup
        // 2. client sends new object with lookup which finds nothing
        // 3. client sends old object which has been deleted for some reason
        //
        // Where "new" is "something it didn't get from server"
        if ( target == null ) {
            _.extend(clientObj, forcedValues);
            // TO_DAN : HACK : Incorrect
            var newId = this.databaseTable.insert(clientObj);
            // comment 0ff7d87a: We want to ensure that
            //
            // obj.upsertFromUntrusted({key: val})
            //
            // obj.key == val
            //
            // doing a db query may not be the right way to do this,
            // but it's not clear that we need the speed at the
            // moment.
            var newObj = this.databaseTable.findOneById(newId);
            // TO_DAN: HACK
            return _.extend(this, newObj);
        } else {
            target.extendClientWithForcedValues(clientObj, forcedValues);
            target._save();
            // See above comment 0ff7d87a
            // TO_DAN: HACK
            return _.extend(this, target);
        }
    },

    extendClientWithForcedValues: function(clientObj, forcedValues) {
        // Something tells me we shouldn't delete from the client object.
        var copyObj = _.clone(clientObj);

        if ( copyObj != null ) {
            // Prevent changing forced values.
            _.each(forcedValues, function(val, key) {
                if ( _.has(copyObj, key) ) {
                    if ( !_.isEqual(val, copyObj[key]) ) {
                        delete copyObj[key]
                    }
                }
            });
        } else {
            // Manually force values.
            copyObj = forcedValues;
        }
        this.extendClient(copyObj);
    }
};


