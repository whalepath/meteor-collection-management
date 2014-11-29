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
<SubClass> = DbObjectType.createSubClass('typename', [ propertyNames ... ], 'collectionName',
 additionalTemporaryProperties, extensions_and_overrides);

OR (only if a custom ordering is needed):
 
 <SubClass> = function() {
    DbObjectType.apply(this, arguments);
};
 DbObjectType.create({subClassType:<SubClass>, typeName:'typename', properties:[ propertyNames|propertyDefinition ... ], databaseTableName:'collectionName'});
 
NOTE: when setting an explicit id on object creation, the special property '_newId' must be set not
_id.

 NOTE: if you wish to override database serialization/deserialization, in the extension_and_overrides:

 fromJSONValue: function (rawJSON) {
            DbObjectType.prototype.fromJSONValue.call(this, rawJSON);
            this.campRegion = CampRegion.enumOf(rawJSON.campRegion);
            this.skillSpecialization = SkillSpecialization.enumOf(rawJSON.skillSpecialization);
            return this;
        },
 toJSONValue: function () {
            var result = DbObjectType.prototype.toJSONValue.call(this);
            result.campRegion = this.campRegion.dbCode;
            result.skillSpecialization = this.skillSpecialization.dbCode;
            return result;
        }
 }

 *
 */
var EJSON = Package.ejson.EJSON;
DbObjectType = function(propertyValues){
    'use strict';
    var that = this;
    // TODO: need to handle propertyNamesClientCanSet filtering when loading new data.
    if ( arguments.length > 0 && propertyValues instanceof Object) {
        this.fromJSONValue(propertyValues);
        
        // if no id currently, *and* a specific id is requested, then copy the specific id
        // note that _newId is not a property per se - it only exists for a brief while.
        // note that this means that the client can not set _newId ( as it will not be included in
        // the generated json )
        if ( this._id == null && propertyValues._newId ) {
            // make sure that any numerics get convert to string ids (required by mongo)
            this._newId = propertyValues._newId +"";
        }
    }
    if ( this.createdAt == null ) {
        this.createdAt = new Date();
    }
    this._makePropertyImmutable('createdAt');
    // HACK SECURITY these properties must only be set on the server : any values from client are
    // suspect
    // createdAt / _id : need to be protected.
    if ( this._id != null) {
        // safety: once the database _id is set don't allow it to be changed.
        this._makePropertyImmutable('_id');
    }
};
var knownOptionKeys = Object.freeze([
    // Optional constructor.
    // TODO: change name to 'constructor' or similar
    'subClassType',
    'typeName',
    'properties',
    'databaseTableName',
    'extensions',
    'privateProperties'
]);
function isPropertyDefinitionWritable(propertyDefinition) {
    return propertyDefinition['writable'] == true || 'set' in propertyDefinition;
}

/**
 * IMPORTANT: The subclass's prototype can only be extended *AFTER* this method is called.
 *
 * If the propertyNamesParam contains a property named 'propertyName' with 'indexed' field set to
 * 'true' then the generated collection has 2 additional methods:
 *    * findOneByPropertyName - returns a single object referenced by the propertyName
 *    * findByPropertyName -
 *          1. primary use is on server side when returning a cursor in a pub/sub
 *          2. or if multiple objects can be returned.
 *    Example: { 'humanId' : { reference: true }}, for such definition methods 'findOneByHumanId' 
 *        and 'findByHumanId' will be created.
 *
 * REFERENCING
 * By default a property with a name ending in 'Id' or 'Ids' is a reference property. All reference
 * properties are indexed.
 *
 * Referencing properties in the future will get convinence methods to get to the referenced
 * object. The name will be important.
 *
 * INDEXING
 * For properties with 'reference' or 'indexed' option set to 'true' an ascending index is created:
 *
 *   ['normal', {'idxProp': {indexed: true}}, {'refProp' : {reference: true}}]
 *
 * PropertiesParam array shown in the example will result in 2 indexes created: one for 'idxProp'
 * and another for 'refProp'.
 *
 * ADVANCED PROPERTY DEFINITION:
 * {
 *   'propertyName': {
 *     'set' : <standard javascript>,
 *     'get' : <standard javascript>,
 *     'configurable' : <standard javascript>,
 *     'writable' : <standard javascript>,
 *     'value' : <standard javascript>,
 *     'toJSONValue' : <function to handle json serialization>,
 *     'fromJSONValue' : <function to handle json deserialization>,
 *     'jsonHelper' : <object that has toJSONValue and fromJSONValue functions that should be used
 *     for json de/serialization>,
 *     'reference' : <default:true if propertyName ends in 'Id' or 'Ids'. if true then the property
 *     is an id to another object.>,
 *     'indexed': <default: true if reference=true. If true then a mongo index is created. See the
 *     INDEXING section>,
 *     'security': <default: true if reference=true OR writable=false. if true the client is not
 *     allowed to set this property>,
 *     'required': <default: false. if true and an instance of this object is saved then a warning
 *     message is printed about missing fields.>,
 *     'derived' : <a stringDotted path to where the properties is actually stored. Used to surface
 *     a property to the top level.>
 *   }
 * }
 *
 * @param subClassType optional constructor function - only supply if need extra special constructor
 * behavior. subclass initialization can happen in a ctor function defined by the subclass.
 * @param typeName required string used for EJSON. (or function)
 * @param properties - declare the properties that the EJSON code will care about. can be
 * array of strings (or objects, or strings AND objects) or can be an object that will be passed to
 * Object.defineProperties. If any value in the key/value pairs is null, then a standard definition
 * will be supplied of : { writable: true }
 * @param databaseTableName - NOTE: To avoid inadvertantly accidentally changing the database table
 * names ( very! bad! ) pass in the databaseTableName as a separate string,
 * also 2 different subclasses can refer to same collection ( think different views )
 * @returns {*} the constructor function
 */
DbObjectType.create = function(options) {
    if (Object.keys(options).length == 0) {
        throw new Meteor.Error(500,'No options in call to ManagerType.create');
    }
    if (!_.isEmpty(_.omit(options, knownOptionKeys))) {
        throw new Meteor.Error(500,
            "invalid option(s) to ManagerType.create:",
            _.omit(options, knownOptionKeys)
        );
    }
     // Note: cannot use strict until there is a way to dereference a global in strict mode
    //'use strict';
    var subClassType;
    var propertyNames = [ ];
    var databaseTableName, extensions;
    var privateProperties;
    // if the first argument is not the constructor function then shift arguments
    if ( typeof options.subClassType != "function" ) {
        subClassType = function() {
            DbObjectType.apply(this, arguments);
            if ( typeof this.ctor === 'function' ) {
                this.ctor.apply(this, arguments);
            }
        };
    } else {
        subClassType = options.subClassType;
    }
    var typeNameArg = options.typeName, typeNameFn;
    if ( typeNameArg == null) {
        throw new Meteor.Error(500, "typeName is null; must be a string or function.");
    } else if (_.isFunction(typeNameArg)) {
        typeNameFn = typeNameArg;
    } else if (_.isString(typeNameArg)) {
        typeNameFn = function() {
            return typeNameArg;
        }
    } else {
        throw new Meteor.Error(500, "typeName must be a string or function not a "+typeof typeNameArg);
    }

    var properties = {};

    // properties that are references to other object
    var referenceProperties = [];
    // properties that have database indicies ( and thus can have special find*() functions
    var indexedProperties = [];
    // properties that must not be null or undefined
    var requiredProperties = [];

    // special handling for each property: for example, jsonHelper, toJSONValue, fromJSONValue, etc.
    // anything that is not an official Javascript attribute on a property definition is copied to
    // this object.
    var specialHandling = {};
    // properties that the client is allowed to set.
    // this will be used to filter out properties such as '_id', 'id', or any properties with a name
    // that ends in 'Id' or Ids
    // these properties should not be set by the client.
    var propertyNamesClientCanSet = [];
    // Property definitions which are not writable should not be
    // added to propertyNamesClientCanSet.
    function processPropertyDefinition(propertyDefinition, propertyName) {
        var property = properties[propertyName] = propertyDefinition || { writable: true };
        if (!_.has(property, 'writable') && !_.has(property, 'get') && !_.has(property, 'set')) {
            // necessary in part because a property definition that is just an empty object (
            // i.e. 'name:{}' ) results in a property that is not writable.
            property['writable'] = true;
        }
        if ( !('security' in property)) {
            // not explicitly marked as secure property. heuristics apply
            if (!('reference' in property)) {
                // clients are not allowed to alter reference properties.
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
            // explicitly safe to share with client
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
        if (property.required) {
            requiredProperties.push(propertyName);
        }
        specialHandling[propertyName] = _.omit(propertyDefinition,
            // these are the property fields that Javascript defines
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperties
            'set', 'get', 'configurable', 'enumerable', 'value', 'writable');
        // we need to know for when we are reading from the database.
        specialHandling[propertyName].writable = isPropertyDefinitionWritable(propertyDefinition);

        propertyNames.push(propertyName);
    }
    // process in default values.
    handleStringOrObjectDefinition.call(this, {
            _id: {
                // required by MongoDb
                security: true,
                enumerable: false,
                // we might allow it to be removed ( for transmission to client)
                configurable: true
            },
            id: {
                get : function() {
                    return this._id;
                },
                enumerable: true,
                security: true
            },
            // when this object created
            createdAt: {
                // by default indexed so we can find last created objects
                indexed: true,
                // client definitely not allowed to fuck with created time
                security: true,
                enumerable: true,
                // we might allow it to be removed ( for transmission to client)
                configurable: true
            },
            lastModifiedAt: {
                indexed: true,
                security: true,
                enumerable: true,
                // we might allow it to be removed ( for transmission to client)
                configurable: true
            }
        },
        processPropertyDefinition,
        false
    );
    handleStringOrObjectDefinition.call(this, options.properties, processPropertyDefinition, false);
    databaseTableName = options.databaseTableName;
    extensions = options.extensions;
    privateProperties = options.privateProperties;

    // make the subClassType extend DbObjectType.prototype 
    // NOTE: this means that any previous code to extend the subClassType.prototype will be lost
    _.extend(properties, {
        propertyNames: {
            writable :false,
            enumerable: false,
            value : Object.freeze(propertyNames)
        },
        propertyNamesClientCanSet : {
            writable :false,
            enumerable: false,
            value : Object.freeze(propertyNamesClientCanSet)
        },
        requiredProperties: {
            writable: false,
            enumerable: false,
            value: Object.freeze(requiredProperties)
        },
        // so that we have the typename easily available for debug output
        // used for EJSON handling
        typeName: {
            writable: false,
            enumerable: false,
            value : typeNameFn
        },
        specialHandling: {
            writable: false,
            enumerable: false,
            value: specialHandling
        }
    });
    if ( privateProperties != null ) {
        _.extend(properties, privateProperties);
    }
    subClassType.prototype = Object.create(DbObjectType.prototype, properties);
    Object.defineProperties(subClassType.prototype, {
        constructor: {
            value: subClassType,
            writable: false,
            enumerable: false
        },
        fromJSONValue: {
            value: function (rawJson) {
                var result = DbObjectType.prototype.fromJSONValue.call(
                    this,
                    subClassType.prototype.specialHandling,
                    rawJson
                );
                return result;
            },
            enumerable: false
        },
        toJSONValue: {
            value: function (selectedPropertyNames) {
                var result = DbObjectType.prototype.toJSONValue.call(
                    this,
                    subClassType.prototype.specialHandling,
                    selectedPropertyNames||propertyNames
                );
                return result;
            },
            enumerable: false
        }
    });
    
    Object.defineProperties(subClassType, {
        typeName: {
            value: subClassType.prototype.typeName,
            enumerable: false,
            writable: false
        },
        toJSONValue: {
            value: subClassType.prototype.toJSONValue,
            enumerable: false,
            writable: false
        },
        fromJSONValue: {
            enumerable: false,
            writable: false,
            value: function () {
                // assumed that not called with a this.
                var that = {};
                // provide property names
                Object.defineProperties(that, {
                    propertyNames: {
                        value: propertyNames,
                        enumerable: false,
                        writable: false
                    }
                });
                return subClassType.prototype.fromJSONValue.apply(that, arguments);
            }
        }
    });
    if ( extensions != null ) {
        _.extend(subClassType.prototype, _valueOrFunctionResult(extensions));
    }

    // create database table if needed
    if ( databaseTableName ) {
        var dbCollection = new Mongo.Collection(databaseTableName, {
            transform: function(doc) {
                // TODO: should this be a different function, since truly new construction is
                // different than recreation?
                return new subClassType(doc);
            }
        });

        // make available both on the prototype (so this.databaseTable works)
        subClassType.prototype.databaseTable = dbCollection;
        // .. and the more statically accessed method HumanResearcher.databaseTable
        // both have their conveniences.
        subClassType.databaseTable = dbCollection;
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
            // special case because field is _id
            findFetchById: function(id) {
                var cursor = this.findById(id);
                if ( cursor ) {
                    return cursor.fetch();
                } else {
                    return null;
                }
            },
            // special case because field is _id
            findOneById: function(id) {
                var result = this.findFetchById(id);
                if ( result ) {
                    return result[0];
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
            },
            findFetchBy: function(propertyName, value) {
                var cursor = this.findBy(propertyName, value);
                if ( cursor ) {
                    return cursor.fetch();
                } else {
                    return null;
                }
            },
            findOneBy: function(propertyName, value) {
                var result = this.findFetchBy(propertyName, value);
                if ( result ) {
                    return result[0];
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
            findLatest: function(selectorArg, options) {
                var selector;
                if (selectorArg == null) {
                    selector = {};
                } else if (typeof selectorArg === 'number') {
                    selector = {seqId: selectorArg.toString() };
                } else if (typeof selectorArg === 'string') {
                    selector = {seqId: selectorArg };
                } else if (typeof selectorArg === 'object') {
                    selector = selectorArg;
                } else {
                    throw new Meteor.Error('findLatest', 'case', typeof selectorArg);
                }
                _.extend(selector, { _nextRevisionId: null });
                return this.find(selector, options);
            },
            findLatestOne: function(selectorArg, options) {
                var cursor = this.findLatest(selectorArg, options);
                if (cursor) {
                    return cursor.fetch()[0];
                } else {
                    return null;
                }
            },
            upsertFromUntrusted: function() {
                return subClassType.prototype.upsertFromUntrusted.apply(subClassType.prototype, arguments);
            }
        });
        // Even though the client does not have indicies, the client still needs the special
        // functions for compatability with server code.
        for (var i in indexedProperties) {
            var propertyName = indexedProperties[i];
            var propertyNameCapitalized = propertyName.substring(0,1).toUpperCase() + propertyName.substring(1);
            _.each(['findOneBy', 'findBy', 'findFetchBy'], function(baseFunctionName) {
                var methodName = baseFunctionName+propertyNameCapitalized;
                if ( dbCollection[methodName] == null) {
                    dbCollection[methodName] = dbCollection[baseFunctionName].bind(dbCollection, propertyName);
                }
            });
        }
        if ( Meteor.isServer) {
            // mini mongo doesn't have info about the mongo collection.
            // NOTE: NOTE: this code was written based on : http://stackoverflow.com/questions/18520567/average-aggregation-queries-in-meteor/18884223#18884223
            // This code works as of Meteor 0.8.2 BUT may not work in future because of reference to
            // MongoInternals
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
                 * Used when replying to a client with the results. This allows us to keep the
                 * mongodb code asynchronous.
                 * @param pipeline
                 * @param callbackFn
                 * @param completeFn
                 */
                aggregateCursor: function (pipeline, callbackFn, completeFn) {
                    var boundCallback = Meteor.bindEnvironment(function(error, result) {
                        if ( error == null ) {
                            // Note: you will not be able to step into this function or set
                            // breakpoints on it.
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
    var typeName = typeNameFn.call(this);
    EJSON.addType(typeName, function(rawJson) {
        // TODO : security : need to hash _id, createdAt and any other immutables + secret salt to
        // make sure that immutables are not changed.
        // this is a little awkward because sometimes deserializing from db, sometimes from client:
        // when deserializing from db different params are allowed?
        // TODO: should this be a different function, since truly new construction is
        // different than recreation?
        var object = new subClassType(rawJson);
        return object;
    });
    DbObjectTypes[typeName] = subClassType;
    return subClassType;
};
// we want code in this package to be able to modify the dbObjectTypes object - but nothing else.
var DbObjectTypes = {};
var JsonHelpers = {};

// TODO: use Object.defineProperties
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
            return this.toEJSONString() === other.toEJSONString();
        }
    },
    /**
     * <typeName,subclassFunction> - this allows us to look up the subclasses for json de/serialization
     *  TODO? : make this a variable that cannot be easily changed
     */
    dbObjectTypes: DbObjectTypes,
    /**
     * additional jsonHelpers
     * <typeName,object with toJSONValue/fromJSONValue>
     */
    jsonHelpers: JsonHelpers,
    /**
     * Properties preserved by this method are properties which go
     * into the db. This includes non-writeable properties.
     *
     * This function should only called by the subclasses of DbObjectType
     */
    toJSONValue: function(specialHandling, selectedPropertyNames) {
        // Note: cannot use strict until there is a way to dereference a global in strict mode
        var that = this;
        var rawJson = {};
        var propertyNames = selectedPropertyNames || this.propertyNames;
        propertyNames.forEach(function(propertyName) {
            var propertyValue=that[propertyName];
            switch( typeof(propertyValue)) {
            case 'undefined':
            case 'function':
                return;
            case 'object':
                if (propertyValue != null) {
                    var jsonFn = _.deep(specialHandling, propertyName + '.toJSONValue');
                    if (!jsonFn) {
                        var jsonHelperObj = _.deep(specialHandling, propertyName + '.jsonHelper');
                        if (jsonHelperObj != null) {
                            var jsonHelper;
                            if (typeof jsonHelperObj === 'string') {
                                jsonHelper = DbObjectType.prototype.dbObjectTypes[jsonHelperObj]
                                          || DbObjectType.prototype.jsonHelpers[jsonHelperObj]
                                          || _.getGlobal()[jsonHelperObj];

                                if ( jsonHelper == null ) {
                                    throw new Meteor.Error(500, that.typeName(),'.',propertyName,
                                        '.jsonHelper=', jsonHelperObj,
                                        " which isn't a global var name or register jsonHelper"
                                    );
                                }
                            } else {
                                jsonHelper = jsonHelperObj;
                            }
                            if (typeof jsonHelper.toJSONValue === 'function') {
                                jsonFn = jsonHelper.toJSONValue;
                            }
                        }
                    }
                    if (jsonFn) {
                        rawJson[propertyName] = jsonFn.call(propertyValue);
                    } else {
                        rawJson[propertyName] = propertyValue;
                    }
                }
                return;
            default:
                // strings, numbers, booleans : anything else: assume that it is in its serialized
                // format
                rawJson[propertyName] = propertyValue;
                return;
            }
        });
        return rawJson;
    },
    /**
     * This function should only called by the subclasses of DbObjectType
     * @param specialHandling
     * @param rawJson
     * @returns {DbObjectType}
     */
    fromJSONValue: function(specialHandling, rawJson) {
        var that = this;
        this.propertyNames.forEach(function(propertyName) {
            switch( typeof(rawJson[propertyName])) {
            case 'undefined':
            case 'function':
                return;
            default:
                if (rawJson[propertyName] != null) {
                    var jsonFn = _.deep(specialHandling, propertyName + '.fromJSONValue');
                    if (!jsonFn) {
                        var jsonHelperObj = _.deep(specialHandling, propertyName + '.jsonHelper');
                        if (jsonHelperObj != null) {
                            var jsonHelper;
                            if (typeof jsonHelperObj === 'string') {
                                jsonHelper = DbObjectType.prototype.dbObjectTypes[jsonHelperObj]
                                          || DbObjectType.prototype.jsonHelpers[jsonHelperObj]
                                          || _.getGlobal()[jsonHelperObj];
                                if ( jsonHelper == null ) {
                                    throw new Meteor.Error(500, that.typeName(),'.',propertyName,
                                        '.jsonHelper=', jsonHelperObj,
                                        " which isn't a global var name"
                                    );
                                }
                            } else {
                                jsonHelper = jsonHelperObj;
                            }
                            if (typeof jsonHelper.fromJSONValue === 'function') {
                                jsonFn = jsonHelper.fromJSONValue;
                            }
                        }
                    }
                    var newValue;
                    if (jsonFn) {
                        newValue = jsonFn(rawJson[propertyName]);
                    } else {
                        newValue = rawJson[propertyName];
                    }
                    try {
                        that[propertyName] = newValue;
                    } catch(e) {
                        // in strict mode we might be trying to set a value which can't be set (
                        // i.e. no 'set' or writable=false )
                    }
                }
                return;
            }
        });
        return this;
    },
    addJsonHelper: function(typeName, objectWithToFromJSONValueFns) {
        jsonHelpers[typeName] = objectWithToFromJSONValueFns;
    },
    /**
     *
     * @returns EJSON.stringify(this)
     */
    toEJSONString: function() {
        try {
            return EJSON.stringify(this);
        } catch(error) {
            console.error("EJSON.stringify failed on a ", this.typeName(),
                " id=", this.id, " error=", error
            );
        }
    },
    // by default call toEJSONString
    toString : function() {
        return this.toEJSONString();
    },
    // TODO(dmr): generically solve the email issue from
    // _humanDumpForTeam at some point
    // textStringForEmailing: function() {
    // },
    pickClient: function(clientObject) {
        if ( clientObject) {
            return _.pick(clientObject, this.propertyNamesClientCanSet);
        } else {
            return {};
        }
    },
    extendClient: function(clientObject) {
        return this.fromJSONValue(this.pickClient(clientObject));
    },

    // look for keys that will be ignored
    checkSelf: function() {
        _.onlyKeysCheck(this, this.requiredProperties, this.propertyNames);
    },
    /* Perform an upsert-like operation from an untrusted client,
     * checking some conditions. Updates only one object, not all
     * objects matching lookup.
     *
     * Call either as a class method like
     *
     * SubClassType.prototype.upsertFromUntrusted(clientObj, lookup, { forcedValues: object })
     *
     * or called as an instance method ( 'this' is an instance of the subClass. )
     *
     * If called as an instance method, there is no lookup parameter. ( the lookup is on this._id )
     *
     * var obj = new SubClassType(...)
     *
     * obj.upsertFromUntrusted(clientObj, optionsParam);
     *
     * obj.upsertFromUntrusted(null, optionsParam);
     *
     * obj.upsertFromUntrusted(clientObj);
     *
     * obj.upsertFromUntrusted(); - in this case the obj is assumed to be from the client. Only the
     * values allowed from the client are updated. The returned object is true server about.
     *
     * TODO: security check on who is allowed to update/save this object.
     * @param clientObj non-null object to update from.
     *
     * @param options - the second parameter if this.upsertFromUntrusted() is called. See comments
     *      for knownOptionKeys
     *
     * @return the database object stored ( will never be 'this' )
     */
    upsertFromUntrusted: function(optionsParam) {
        'use strict';
        var knownOptionKeys = [
            // new values to upsert
            'clientObj',
            // (optional) either mongodb query to find existing or a string which is the object id
            // or object (default={_id: clientObj._id}) or function yielding existing object.
            'lookup',
            // values which must be present in the client.
            'forcedValues',
            // if unset, set, else ignore.
            'frozenKeys',
            // if we would insert, throw an error instead
            'updateOnly',
            // use _revisionSave rather than _save
            'revision'
        ];
        var options = _.extend({}, optionsParam);
        if (!_.isEmpty(_.omit(options, knownOptionKeys))) {
            var msg = "Was correct object passed to invalid option to upsertFromUntrusted? " +
                "upsertFromUntrusted passed object with these keys: "+ _.keys(_.omit(options, knownOptionKeys))+
                " expected only :"+knownOptionKeys;
            throw new Meteor.Error(500, msg);
        }
        var clientObj, lookup;

        // upsertFromUntrusted can be called  <someDBObjectType>.prototype.upsertFromUntrusted(..)
        // or <someDBObjectInstance>.upsertFromUntrusted(..)
        if ( this instanceof DbObjectType && this.constructor.prototype !== this) {
            switch (arguments.length) {
            case 0:
                // 'this' is the untrusted object and itself is suspect.
                clientObj = this;
                break;
            case 1:
                clientObj = options.clientObj || this;
                break;
            default:
                throw new Meteor.Error(500, "only 0,1 arguments when calling as instance method.");
            }
            if ( this._id ) {
                lookup = { _id: this._id };
            } else if ( this.id ) {
                lookup = { _id : this.id };
            } else {
                // a new object.
                // but what if the _newId is set to an id that already exists?
                // then we should be doing an insert so that is save.
                lookup = null;
            }
            // call on an someDBObjectInstance, not on the prototype
            // but because we are calling upsertFromUntrusted() on an instance, the instance itself
            // is untrusted.  so we pickClient on this.
        } else {
            clientObj = options.clientObj;
            lookup = options.lookup;
            if (_.isEmpty(clientObj)) {
                // no changes to apply. But this is not really an error, just a case of a client
                // being lazy about sending an empty object. (also could happen for other reasonable
                // reasons)
                // Yes we could decide to allow a global
                return null;
            }

            // If the user doesn't supply lookup params, still try to
            // do _id lookup.
            if (typeof lookup == 'function') {
                // Some users get their objects not by query, but by custom
                // method, such as currentHuman.
                lookup = lookup();
            } else if (typeof lookup === 'string') {
                lookup = { _id: lookup };
            } else if (lookup == null ) {
                if ( _.has(clientObj, '_id')) {
                    lookup = { _id: clientObj._id };
                } else if (_.has(clientObj, 'id')) {
                    lookup = { _id: clientObj.id };
                }
            } else {
                // lookup with some json object.
                // TODO do toJSONValue to guarantee in proper format.
            }

        }

        if ( lookup != null && _.isEmpty(lookup)) {
            // NOTE: the above check is correct: a null/undefined lookup means we are doing a insert.
            // HOWEVER, we check for empty lookup because we don't want to allow a error in creating
            // the lookup object to result in an update that alters every object in the database.
            throw new Meteor.Error(500,
                "upsertFromUntrusted: lookup is {} -",
                "and thus would result in modifying all documents or a random single document."
            );
        }

        // The object to update (or insert if set to null).
        // NOTE: 'this' may have come from a client (untrusted) or loaded from the server database
        // (trusted).  The combinations to reliable determine what is the best course of action are
        // problematic and subject to developer confusion. For this reason, we only
        var target = null;
        if (lookup != null) {
            if ( lookup._id != null) {
                // if lookup by id then we must find the object.
                _.extend(options, { updateOnly: true});
            }
            target = this.constructor.databaseTable.findOne(lookup);
        }

        // No more chances to find target
        if (options.updateOnly && target == null) {
            throw new Meteor.Error(500, 'no update target, but updateOnly=true');
        }

        // This happens when
        //
        // 1. client sends new object with no lookup
        // 2. client sends new object with lookup which finds nothing
        // 3. client sends old object which has been deleted for some reason
        //
        // Where "new" is "something it didn't get from server"
        if ( target == null ) {
            target = new this.constructor();
        }

        if (options.frozenKeys && options.frozenKeys.length > 0) {
            var keysToOmit =  _.filter(options.frozenKeys, function(key) {
                return target.key != undefined;
            });
            clientObj = _.omit(clientObj, keysToOmit);
        }
        target.extendClient(clientObj);
        // assuming that options.forcedValues do not need conversion from json.
        _.extend(target, options.forcedValues);
        if (options.revision) {
            target._revisionSave();
        } else {
            target._save();
        }
        return target;
    },
    _revisionSave: function() {
        var self = this;
        var newRevision = new self.constructor(_.omit(self, '_id', 'createdAt', 'lastModifiedAt'));
        // You know what would be nice right now? Transactions. Shit mongo, get it together.
        newRevision._save();
        self.databaseTable.update(
            {_id: self._id},
            {$set: { _nextRevisionId: newRevision.id }},
            {multi: false}
        );
        return newRevision;
    },
    /**
     * our standard save method.
     * @private
     */
    _save: function() {
        'use strict';
        var that =this;
        // allow the id to be supplied explicitly when creating a new record
        var _newId;
        if ( this._newId ) {
            // meteor requires that ids be strings. Just in case a number was used, make sure it is
            // converted to a string
            _newId = ""+this._newId;
            delete this._newId;
        }
        try {
            this.checkSelf();
        } catch(e){
            if ( _newId ) {
                console.error(that.typeName(),": While saving a NEW db record:"+ e.message);
            } else {
                console.error(that.typeName(),":",that.id,": While saving a db record:"+ e.message);
            }
            debugger;
        }
        // update lastModifiedAt always
        this.lastModifiedAt = new Date();
        if ( this._id ) {
            var affectedDocumentCount = this.databaseTable.update(
                    {_id: this._id},
                    this.toJSONValue(),
            function(error, affectedDocuments) {
                if (error) {
                    console.error(
                        that.typeName(),":",that.id,":Failed to update with "+that._id+ ": "+error
                    );
                    debugger;
                }
            });
            if ( affectedDocumentCount == 0 ) {
                console.error(that.typeName(),":",that.id,": No documents found with id");
                debugger;
            }
        } else {
            var jsonValue = this.toJSONValue();
            if ( _newId ) {
                jsonValue._id = _newId;
            }
            var _id = this.databaseTable.insert(jsonValue, function(error, idSet) {
                if ( error ) {
                    console.error(that.typeName(),":",that.id,":Failed to insert with : "+error);
                }
            });
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
    extendClientWithForcedValues: function(clientObj, forcedValues) {
        if ( clientObj == null && forcedValues == null ) {
            // TODO(dmr) Check what extendClient returns
            return this;
        }

        // Something tells me we shouldn't delete from the client object.
        var copyObj = _.clone(clientObj);

        if ( copyObj != null ) {
            // Prevent changing forced values.
            _.each(forcedValues, function(val, key) {
                if ( _.has(copyObj, key) ) {
                    if ( !_.isEqual(val, copyObj[key]) ) {
                        delete copyObj[key];
                    }
                }
            });
        } else {
            // Manually force values.
            copyObj = forcedValues;
        }
        return this.extendClient(copyObj);
    }
};

//  toJSON : seems to be the preferred name for some javascript code.
DbObjectType.prototype.toJSON = DbObjectType.prototype.toJSONValue;
Object.defineProperties(DbObjectType, {
    dbObjectTypes: {
        get: function () {
            return DbObjectType.prototype.dbObjectTypes;
        },
        enumerable: true,
        configurable: false
    }
});
