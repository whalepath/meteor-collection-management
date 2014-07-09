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
    // need to get momentjs on the browser
//    Object.defineProperties(this, {
//        createdAtStr: {
//            writable: false,
//            // "2013-04-01T09:02:00"
//            value: this.createdAt.getFullYear()+'-'+
//        }
//    });
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
        _.each(propertiesObject, function(propertyDefinition, propertyName) {
            property = properties[propertyName] = propertyDefinition || { writable: true };
            if (!_.has(property, 'writable') && !_.has(property, 'get') && !_.has(property, 'set')) {
                // necessary in part because a property definition that is just an empty object ( i.e. 'name:{}' ) results in a property that is not writable.
                property['writable'] = true;
            }

            if (property.reference) {
                referenceProperties.push(propertyName);
            }
            if (property.reference || property.indexed) {
                indexedProperties.push(propertyName);
            }
            if ( !('security' in property)) {
                // not explicitly marked as secure property. heuristics apply
                if (!('reference' in property)) {
                    var propertyNameLen = propertyName.length;
                    if ( propertyName.substring(propertyNameLen-2) !== 'Id' && propertyName.substring(propertyNameLen-3) !== 'Ids') {
                        // exclude properties ending in 'Id' or 'Ids'
                        propertyNamesClientCanSet.push(propertyName);
                    }
                } else if ( property.reference === false) {
                    // explicitly not a reference and the security value is false or undefined.
                    propertyNamesClientCanSet.push(propertyName);
                }
            } else if ( property.security === false) {
                // explicitly safe.
                propertyNamesClientCanSet.push(propertyName);
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
                aggregate: function () {
                    var args = Array.prototype.slice.call(arguments,0);
                    if (args.length < 1) {
                        throw new Meteor.Error(databaseTableName+":need a pipeline for aggregation");
                    } else if (args.length < 2 || args[1] == null) {
                        args[1] = {};
                    } else if ( typeof args[1] === 'function' ) {
                        // callback function supplied but no options
                        args.splice(1, 0, {});
                    }
                    var dbCollection = this.getMongoDbCollection();
                    var results = dbCollection.aggregate.apply(dbCollection, args);
                    return results;
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
    }
};


