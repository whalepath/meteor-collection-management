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
 DbObjectType.create({
     subClassType:<SubClass>,
     typeName:'typename',
     properties:[ propertyNames|propertyDefinition ... ],
     databaseTableName:'collectionName'}
 );
 
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
/**
 * Uses fromJSONValue() to convert propertyValues to properties on the created object.
 *
 * @param propertyValues
 * @constructor
 */
DbObjectType = function(propertyValues){
    'use strict';
    var self = this;
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
var CreateKnownOptionKeys = Object.freeze([
    // Optional constructor.
    // TODO: change name to 'constructor' or similar
    'subClassType',
    'typeName',
    'properties',
    'databaseTableName',
    'databaseDefinition',
    'extensions',
    'privateProperties',
    // an optional object with 'server', 'client'
    'platform',
    'nonstrict'
]);
var upsertFromUntrustedKnownOptionKeys = Object.freeze([
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
    'revision',
    // passed to _revisionSave; allow the save even if target isn't the head of a revision
    // sequence.
    'allowForks'
]);

var PropertyDefinitionOptionKeys = Object.freeze([
    'set', 'get', 'configurable', 'enumerable', 'value', 'writable',
    'toJSONValue', 'fromJSONValue', 'jsonHelper',
    'reference', 'indexed', 'security', 'required',
    'defaultValue', 'derived'
]);
function isPropertyDefinitionWritable(propertyDefinition) {
    return propertyDefinition['writable'] == true || 'set' in propertyDefinition;
}

var LatestRevisionSelector = Object.freeze({ _nextRevisionId: null });

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
 *     'defaultValue': <a value or a function returning a value that will be used if the property is
 *     undefined ( not just null ) function is passed>
 *
 *     // TODO: not yet implement:
 *     'derived' : <a stringDotted path to where the properties is actually stored. Used to surface
 *     a property to the top level.>
 *     'nonstrict': <true / false - update with $set>
 *   }
 * }
 * @param fullOptions
 *
 *  'subClassType': optional constructor function - only supply if need extra special constructor
 * behavior. subclass initialization can happen in a ctor function defined by the subclass.
 *
 *  'typeName; : required string used for EJSON. (or function)
 *
 *  'properties': declare the properties the EJSON code will care about. can be
 * array of strings (or objects, or strings AND objects) or can be an object that will be passed to
 * Object.defineProperties. If any value in the key/value pairs is null, then a standard definition
 * will be supplied of : { writable: true }
 *
 *   'databaseTableName' - NOTE: To avoid inadvertantly accidentally changing the database table
 * names ( very! bad! ) pass in the databaseTableName as a separate string,
 * also 2 different subclasses can refer to same collection ( think different views )
 *
 * @returns {*} the constructor function
 */
DbObjectType.create = function(fullOptions) {
    // Note: cannot use strict until there is a way to dereference a global in strict mode
    //'use strict';
    if (Object.keys(fullOptions).length == 0) {
        throw new Meteor.Error(500,'No options in call to DbObjectType.create. Allowed options='
            +CreateKnownOptionKeys);
    }
    if (!_.isEmpty(_.omit(fullOptions, CreateKnownOptionKeys))) {
        throw new Meteor.Error(500,
            "invalid option(s) to DbObjectType.create. Unknown options=" +
            Object.keys(_.omit(fullOptions, CreateKnownOptionKeys)) +
                ". Allowed options="+CreateKnownOptionKeys
        );
    }
    // TODO: do a deep *merge* of fullOptions.platform.<platform>(note: extend isn't what is wanted)
    var options = _.extend({}, _.omit(fullOptions, 'platform'));
    var subClassType;
    var propertyNames = [ ];
    var databaseDefinition, extensions;
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
        };
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
    
    // properties that have defaults
    var propertiesWithDefault = [];

    // special handling for each property: for example, jsonHelper, toJSONValue, fromJSONValue, etc.
    // anything that is not an official Javascript attribute on a property definition is copied to
    // this object.
    var specialHandling = {};
    // properties that the client is allowed to set.
    // this will be used to filter out properties such as '_id', 'id', or any properties with a name
    // that ends in 'Id' or Ids
    // these properties should not be set by the client.
    // Property definitions which are not writable should not be
    // added to propertyNamesClientCanSet.
    var propertyNamesClientCanSet = [];

    function processPropertyDefinition(propertyDef, propertyName) {
        'use strict';

        var propertyDefinition = _.pick(propertyDef, PropertyDefinitionOptionKeys);
        if (_.isEmpty(propertyDefinition)) {
            propertyDefinition = {writable: true};
        }
        properties[propertyName] = propertyDefinition;

        if (!_.has(propertyDefinition, 'writable')
         && !_.has(propertyDefinition, 'get')
         && !_.has(propertyDefinition, 'set')) {
            // necessary in part because a property definition that is just an empty object (
            // i.e. 'name:{}' ) results in a property that is not writable.
            propertyDefinition['writable'] = true;
        }
        if ( !('security' in propertyDefinition)) {
            // not explicitly marked as secure property. heuristics apply
            if (!('reference' in propertyDefinition)) {
                // clients are not allowed to alter reference properties.
                var propertyNameLen = propertyName.length;
                if ( propertyName.substring(propertyNameLen-2) !== 'Id'
                  && propertyName.substring(propertyNameLen-3) !== 'Ids') {
                    // exclude properties ending in 'Id' or 'Ids'
                    if(isPropertyDefinitionWritable(propertyDefinition)) {
                        propertyNamesClientCanSet.push(propertyName);
                    }
                } else {
                    // By default propertyNames ending in 'Id' or 'Ids' are reference properties.
                    propertyDefinition.reference = true;
                }
            } else if ( propertyDefinition.reference === false) {
                // explicitly not a reference and the security value is false or undefined.
                if(isPropertyDefinitionWritable(propertyDefinition)) {
                    propertyNamesClientCanSet.push(propertyName);
                }
            }
        } else if ( propertyDefinition.security === false) {
            // explicitly safe to share with client
            if(isPropertyDefinitionWritable(propertyDefinition)) {
                propertyNamesClientCanSet.push(propertyName);
            }
        }
        if (propertyDefinition.reference) {
            referenceProperties.push(propertyName);
        }
        if (propertyDefinition.reference || propertyDefinition.indexed) {
            indexedProperties.push(propertyName);
        }
        if (propertyDefinition.required) {
            requiredProperties.push(propertyName);
        }
        // these are the property fields that Javascript defines
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperties
        specialHandling[propertyName] = _.omit(propertyDefinition,
            'set', 'get', 'configurable', 'enumerable', 'value', 'writable', 'defaultValue');
        if ( typeof propertyDefinition.defaultValue !== 'undefined' ) {
            // remember to allow 0 / false / null as a default :-)
            var defaultValue = propertyDefinition.defaultValue;
            specialHandling[propertyName].defaultValue = _.isFunction(defaultValue) ?
                function () {
                    return defaultValue.call(this, propertyName);
                } :
                function () {
                    return defaultValue;
                };
            propertiesWithDefault.push(propertyName);
        }
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
    databaseDefinition = options.databaseDefinition;
    extensions = options.extensions;
    privateProperties = options.privateProperties;
    var nonstrict = !!options.nonstrict;

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
        },
        propertiesWithDefault: {
            writable: false,
            enumerable: false,
            value: propertiesWithDefault
        },
        // HACK should really be defined in the list of object properties via
        // handleStringOrObjectDefinition()
        // HACK: avoids the id being saved twice in the database. really need ability to make a
        // property as not to be saved in server db.
        id: {
            get : function() {
                return this._id;
            },
            enumerable: true,
            //security: true
        },
        nonstrict: {
            'get': function() {
                return nonstrict;
            }
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
                var self = {};
                // provide property names
                Object.defineProperties(self, {
                    propertyNames: {
                        value: propertyNames,
                        enumerable: false,
                        writable: false
                    },
                    propertiesWithDefault: {
                        value: propertiesWithDefault,
                        enumerable: false,
                        writable: false
                    }
                });
                return subClassType.prototype.fromJSONValue.apply(self, arguments);
            }
        },
        findAllReferencesQueries: function(options) {
            // TODO: maybe make defined only once on DbObjectType
            var _options;
            if ( options ) {
                _options = _.extend({}, options);
            } else {
                _options = {};
            }
            _.extend(_options, {
                typeName: subClassType.prototype.typeName()
            });
            var queriesAndUpdatesObject = _findAllReferencesQueries(_options);
            return queriesAndUpdatesObject;
        }
    });
    if ( extensions != null ) {
        var resolvedExtensions = _valueOrFunctionResult(extensions);
        if (_.isArray(resolvedExtensions)) {
            console.warn(
                subClassType,typeName(),
                ": extensions is an array - usually intended to be an object"
            );
        }
        _.extend(subClassType.prototype, resolvedExtensions);
    }

    if ( databaseDefinition == null && options.databaseTableName != null) {
        databaseDefinition = {
            databaseTableName: options.databaseTableName
        };
    }
    var dbCollection = _.deep(databaseDefinition, 'databaseTable');
    // create database table if needed
    if ( databaseDefinition != null && dbCollection == null) {
        if (databaseDefinition.databaseType == null || databaseDefinition.databaseType === 'mongo') {
            databaseDefinition.databaseTable = dbCollection = new Mongo.Collection(
                databaseDefinition.databaseTableName, {
                transform: function (doc) {
                    // TODO: should this be a different function, since truly new construction is
                    // different than recreation?
                    return new subClassType(doc);
                }
            });
        }
    }

    if ( dbCollection != null) {
        // make available both on the prototype (so this.databaseTable works)
        subClassType.prototype.databaseTable = dbCollection;
        // .. and the more statically accessed method HumanResearcher.databaseTable
        // both have their conveniences.
        subClassType.databaseTable = dbCollection;
        /**
         * These functions are usually called from generated partially bound functions.
         *
         */
        var databaseExtensions = {
            // TODO: fold this into the general referenceProperties method generation that follows.
            findById: function(id) {
                if ( id == null ) {
                    // remember typeof null === 'object'
                    return null;
                } else if ( typeof id ==='number' ) {
                    return this.find({_id: "" + id});
                } else if ( id instanceof Array ) {
                    return this.find({_id:{$in: id}});
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
            findRequiredOneById: function(id) {
                var result = this.findFetchById(id);
                if ( result == null || result[0] == null ) {
                    throw new Meteor.Error("404", "no item with id " + id);
                } else {
                    return result[0];
                }
            },
            /*
             , ... any other arguments that can go to Mongo.find
             */
            findBy: function(propertyName, value/*,...*/) {
                var args = __findFnArguments.apply(this, arguments);
                var result = this.find.apply(this, args);
                return result;
            },
            /**
             * @param propertyName String - prebound.
             *
                , ... any other arguments that can go to Mongo.find
            */
            findFetchBy: function(propertyName, value/*,...*/) {
                var cursor = this.findBy.apply(this, arguments);
                if ( cursor ) {
                    return cursor.fetch();
                } else {
                    return null;
                }
            },
            findOneBy: function(propertyName, value) {
                var args = __findFnArguments.apply(this, arguments);
                var result = this.findOne.apply(this, args);
                return result;
            },
            findRequiredOneBy: function(propertyName, value) {
                var result = this.findOneBy.apply(this, arguments);
                if ( result == null  ) {
                    throw new Meteor.Error("404", "no item with "+propertyName+" = " + value);
                } else {
                    return result;
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
            // exposed so that LatestRevisionSelector can be used in other queries
            LatestRevisionSelector:LatestRevisionSelector,
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
                _.extend(selector, LatestRevisionSelector);
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
            /**
             * Make sure that the update does not replace the content of the document by forcing the
             * use of $set.  if there are any non '$' keys in changedValues.
             *
             * @param selector - must be have a selector - not allowed for universal updating.
             * @param changedValues
             */
            updateSome:function(selector, changedValues, options) {
                if ( selector == null || _.isEmpty(selector) ) {
                    return 0;
                }
                if (_.isEmpty(changedValues) ) {
                    return 0;
                }
                var allDollarElements =  _.reduce(Object.keys(changedValues), function(memo, key){
                    if ( memo === false) {
                        return false;
                    } else {
                        return key.substring(0,1) === '$';
                    }
                }, true);
                var updateDirective;
                if ( allDollarElements === false ) {
                    updateDirective = {$set:changedValues};
                } else {
                    updateDirective = changedValues;
                }
                var result = subClassType.databaseTable.update(selector, updateDirective, options);
                return result;
            },
            updateAll:function(selector, changedValues, options) {
                var opts = {multi:true};
                if ( options != null ) {
                    _.extend(opts,options);
                }
                var result = this.updateSome(selector, changedValues, opts);
                return result;
            },
            updateAllBy:function(propertyName, value, changedValues,options) {
                var selector = {};
                selector[propertyName] = value;
                var result = this.updateAll(selector, changedValues, options);
                return result;
            },
            updateOneBy:function(propertyName, value, changedValues) {
                var selector = {};
                selector[propertyName] = value;
                var result = this.updateSome(selector, changedValues);
                return result;
            },
            updateOneById:function(id, changedValues) {
                if (_.isEmpty(id) ) {
                    return 0;
                }
                var result = this.updateOneBy('_id', id, changedValues);
                return result;
            },
            upsertFromUntrusted: function() {
                return subClassType.prototype.upsertFromUntrusted.apply(
                    subClassType.prototype,
                    arguments
                );
            }
        };
        _.extend(subClassType.databaseTable, databaseExtensions);

        // Allow e.g. DBObject.find as shorthand for DBObject.databaseTable.find.

        var convenienceMethodNames = Object.keys(databaseExtensions);
        convenienceMethodNames.push('find', 'findOne');

        // Even though the client does not have indicies, the client still needs the special
        // functions for compatability with server code.
        for (var i in indexedProperties) {
            var propertyName = indexedProperties[i];
            var propertyNameCapitalized = propertyName.substring(0,1).toUpperCase()
                    + propertyName.substring(1);
            _.each([
                'findOneBy',
                'findBy',
                'findFetchBy',
                'updateOneBy',
                'updateAllBy'
            ], function(baseFunctionName) {
                var methodName = baseFunctionName+propertyNameCapitalized;
                // add findByIndexedProperty to DBObject
                convenienceMethodNames.push(methodName);
                if ( dbCollection[methodName] == null) {
                    dbCollection[methodName] = dbCollection[baseFunctionName].bind(
                        dbCollection,
                        propertyName
                    );
                }
            });
        }
        // Now we have all the method names.
        var convenienceMethods = {};
        _.each(convenienceMethodNames, function(name) {
            if (_.isFunction(subClassType.databaseTable[name])) {
                convenienceMethods[name] = subClassType.databaseTable[name].bind(subClassType.databaseTable);
            } else {
                convenienceMethods[name] = subClassType.databaseTable[name];
            }
        });
        _.extend(subClassType, convenienceMethods);

        if ( Meteor.isServer) {
            // mini mongo doesn't have info about the mongo collection.
            // NOTE: this code was written based on:
            //
            // http://stackoverflow.com/questions/18520567/average-aggregation-queries-in-meteor/18884223#18884223
            //
            // This code works as of Meteor 0.8.2 BUT may not work in future because of reference to
            // MongoInternals
            var databaseTableName = databaseDefinition.databaseTableName;
            _.extend(subClassType.databaseTable, {
                /**
                 * Used when we need to get direct access to the mongo db collection using methods that
                 * that meteor does not directly support. For example, aggregate functions.
                 * @returns The raw mongo db object
                 */
                getMongoDbCollection: function () {
                    var db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
                    var mongoDbCollection = db.collection(databaseTableName);
                    return mongoDbCollection;
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
                    var mongoDbCollection = this.getMongoDbCollection();
                    mongoDbCollection.aggregate(pipeline, boundCallback);
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
    if (Meteor.isClient) {
        // For debugging: get raw collection of records available to client.
        Object.defineProperty(subClassType, '_rawDocs', {
            get: function() {
                return this.databaseTable._collection._docs._map;
            }
        });
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
        var self = this;
        var rawJson = {};
        var propertyNames = selectedPropertyNames || this.propertyNames;
        propertyNames.forEach(function(propertyName) {
            var propertyValue=self[propertyName];
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
                                    throw new Meteor.Error(500, self.typeName(),'.',propertyName,
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
        var self = this;
        // we iterate on the defined property names not the properties in the rawJson, because an
        // attacker could send an object with a lot of properties and by following a whitelist
        // approach we avoid the 'attacker-is-smarter-than-pat' problem.
        var filteredRawJson = _.pick(rawJson, self.propertyNames);
        _.each(filteredRawJson, function(rawJsonVal, propertyName) {
            var rawJsonValue = _valueOrFunctionResult(rawJsonVal);
            var specialHandlingForProperty = _.deep(specialHandling, propertyName);
            // TODO: should null be ignored or only undefined?
            if (rawJson[propertyName] != null) {
                var jsonFn = _.deep(specialHandlingForProperty, 'fromJSONValue');
                if (!jsonFn) {
                    var jsonHelperObj = _.deep(specialHandlingForProperty, 'jsonHelper');
                    if (jsonHelperObj != null) {
                        var jsonHelper;
                        if (typeof jsonHelperObj === 'string') {
                            jsonHelper = DbObjectType.prototype.dbObjectTypes[jsonHelperObj]
                            || DbObjectType.prototype.jsonHelpers[jsonHelperObj]
                            || _.getGlobal()[jsonHelperObj];
                            if (jsonHelper == null) {
                                throw new Meteor.Error(500, self.typeName(), '.', propertyName,
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
                    self[propertyName] = newValue;
                } catch (e) {
                    // in strict mode we might be trying to set a value which can't be set (
                    // i.e. no 'set' or writable=false )
                }
            }
            return;
        });
        // now apply defaults, now that all the explicit values are assigned ( allows some defaults
        // to be based on other values )
        // now here we have to explicitly go through only the properties with known default values.
        self.propertiesWithDefault.forEach(function(propertyName) {
            if ( typeof self[propertyName] === 'undefined') {
                var defaultValueFn = _.deep(specialHandling, propertyName+'.defaultValue');
                if (defaultValueFn ) {
                    self[propertyName] = defaultValueFn.call(self);
                }
            }
        });
        // handle objects that we are not strict about require the property definition.
        if ( this.nonstrict) {
            var nonstrictRawJson = _.omit(rawJson, self.propertyNames);
            _.extend(this, nonstrictRawJson);
        }

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
        var self = this;
        try {
            return EJSON.stringify(this);
        } catch(error) {
            self.error("EJSON.stringify failed error=", error);
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
        if ( !this.nonstrict ) {
            // we only take what is defined.
            _.onlyKeysCheck(this, this.requiredProperties, this.propertyNames);
        }
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
     *      for upsertFromUntrustedKnownOptionKeys
     *
     * @return the database object stored ( will never be 'this' )
     * NOTE: will return undefined if optionsParam.revision === true and the code tries to save
     */
    upsertFromUntrusted: function(optionsParam) {
        'use strict';

        var options = _.extend({}, optionsParam);
        if (!_.isEmpty(_.omit(options, upsertFromUntrustedKnownOptionKeys))) {
            var msg = [
                "Was correct object passed to invalid option to upsertFromUntrusted?",
                "upsertFromUntrusted passed object with these keys:",
                _.keys(_.omit(options, upsertFromUntrustedKnownOptionKeys)),
                "expected only:",
                upsertFromUntrustedKnownOptionKeys
            ].join(' ');
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
        // problematic and subject to developer confusion.
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
        // TODO: assuming that options.forcedValues do not need conversion from json.
        // TODO: only save the values that have changed - if nothing changed then no update :-)
        _.extend(target, options.forcedValues);
        var result;
        if (options.revision) {
            // NOTE(dmr, 2015-04-09) Per discussion w/pat, we force allowForks to false pending
            // a more careful reflection on exactly when we should allow allowForks.
            result = target._revisionSave(false && options.allowForks);
        } else {
            result = target._save();
        }
        return result;
    },
    /**
     * save an object, keeping a copy of the old version
     * @param allowForks: roll back 'transaction' if the target object is not the head of a
     * sequence of revisions
     * @return the new revision OR undefined if the revision would cause a fork.
     */
    _revisionSave: function(allowForks) {
        'use strict';
        var self = this;
        var newRevision = new self.constructor(_.omit(self, '_id', 'createdAt', 'lastModifiedAt'));
        // You know what would be nice right now? Transactions. Shit mongo, get it together.
        newRevision._save();
        var updateSelector = {_id: self._id};
        if (allowForks !== true) {
            updateSelector._nextRevisionId = null;
        }
        var numUpdates = self.databaseTable.update(
            updateSelector,
            {$set: { _nextRevisionId: newRevision.id }},
            {multi: false}
        );
        if (numUpdates == 0 && allowForks !== true) {
            self.error('failed numUpdates == 0 && allowForks!==true');
            self.databaseTable.remove({_id: newRevision.id});
            return void(0);
        } else {
            return newRevision;
        }
    },
    /**
     * our standard save method.
     * @private
     */
    _save: function() {
        'use strict';
        var self =this;
        // allow the id to be supplied explicitly when creating a new record
        var _newId;
        if (this._newId ) {
            if (_.isNumber(this._newId)) {
                // meteor requires that ids be strings. if a number was used, make sure it is
                // converted to a string
                _newId = "" + this._newId;
            } else {
                // https://mongodb.github.io/node-mongodb-native/api-bson-generated/objectid.html
                // a string or mongo ObjectID()
                // TODO: use ObjectID()
                _newId = this._newId;
            }
            delete this._newId;
        }
        try {
            this.checkSelf();
        } catch(e){
            if ( _newId ) {
                self.error("While saving a NEW db record:"+ e.message);
            } else {
                self.error("While saving a db record:"+ e.message);
            }
            debugger;
        }
        // update lastModifiedAt always
        this.lastModifiedAt = new Date();
        var jsonForDb = this._createJsonForDb();
        if ( this._id ) {
            /**
             * NOTE: BUG 22 Jun 2015 PATM: I Don't know how to fix this.
             * Repo case:
             * 1) create a nonstrict object
             * 2) add a new array (conversations) with elements to the dbObject.
             *  dbObject.externalIds.intercom_io.conversations = [ { assigned_to: "agassan"} ]
             * 3) update this object.
             * 4) flattenObj will return: as the flattened value
             *  externalIds.intercom_io.conversations.0.assigned_to: "agassan"
             * 5) mongodb interprets externalIds.intercom_io.conversations as an OBJECT not an array.
             * 6) trying to get around this with:
             * 'externalIds.intercom_io.conversations': [], results in :
             * [MongoError: Cannot update 'externalIds.intercom_io.conversations' and 'externalIds.intercom_io.conversations.0' at the same time]
             *
             * Note that this is a problem if we don't want to send entire object on updates.
             */
            var jsonForUpdate = this.nonstrict? { $set: _.flattenObj(jsonForDb) } : jsonForDb;
            var affectedDocumentCount = this.databaseTable.update(
                {_id: this._id},
                // TODO: use $set so only unchanged bits need to go to the db.
                // TODO: use lastModifiedAt: $currentDate to set the timestamp
                // http://docs.mongodb.org/manual/reference/operator/update/currentDate/#up._S_currentDate
                jsonForUpdate,
                function(error, affectedDocuments) {
                    if (error) {
                        self.error(self._id,":Failed to update. error=",error,
                            "jsonForUpdate=", jsonForUpdate);
                        debugger;
                    }
                }
            );
            if ( affectedDocumentCount == 0 ) {
                self.error(self._id,":No documents found with id");
                debugger;
            }
        } else {
            if ( _newId ) {
                jsonForDb._id = _newId;
            }
            var _id = this.databaseTable.insert(jsonForDb, function(error, idSet) {
                if ( error ) {
                    self.error("Failed to insert. error=",error,
                        "jsonForDb=", jsonForDb);
                    debugger;
                }
            });
            this._id = _id;
            this._makePropertyImmutable('_id');
        }
        return this;
    },
    _createJsonForDb: function() {
        var self = this;
        // TODO: certain objects we don't want to convert to a string representation
        // Specifically: ObjectID, Date. However for sending to the client we do want to convert to
        // a string... argh!
        var jsonToUpdate = self.toJSONValue();
        // HACK: this is for update so we don't need the _id ( also this handles the problem with _id)
        // being a Mongo ObjectId
        // TODO: we also have problem with sending to the client ( we want to hide data )
        delete jsonToUpdate._id;
        if ( self.nonstrict ) {
            var extraPropsFound = [];
            // allow undefined properties
            _.difference(Object.getOwnPropertyNames(self), self.propertyNames).forEach(function(key) {
                // HACK : is there a better way of stripping down this undefined property
                // to a json object?
                try {
                    extraPropsFound.push(key);
                    if ( self[key] !== undefined && self[key] !== null) {
                        jsonToUpdate[key] = JSON.parse(JSON.stringify(self[key]));
                    }
                } catch(e) {
                    // TODO: error message
                    self.error("nonstrict object: _createJsonForDb key =", key, "could not be converted to json. These extra keys found=", extraPropsFound);
                    debugger;
                }
            });
        }
        return jsonToUpdate;
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
    },
    error: function() {
        var msg = [this.typeName(), ": id=",this.id,"; "].concat(arguments);
        console.error.apply(console, msg);
    },
    findAllReferencesQueries: function(options) {
        var _options;
        if ( options ) {
            _options = _.extend({}, options);
        } else {
            _options = {};
        }
        _.extend(_options, {
            typeName: this.typeName(),
            id: this.id
        });
        var queriesAndUpdatesObject = _findAllReferencesQueries(_options);
        return queriesAndUpdatesObject;
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

/**
 * + other arguments...
 * @param propertyName
 * @param value
 * @private
 */
var __findFnArguments = function(propertyName, value) {
    if ( propertyName == null ) {
        throw new Error("undefined/null propertyName");
    }

    var request = {};
    if ( value instanceof Array ) {
        request[propertyName] = {$in: value};
    } else {
        request[propertyName] = value;
    }
    var args = [request].concat(Array.prototype.slice(arguments, 2));
    return args;
}

var _findAllReferencesQueries = function(options) {
    var id = options.id;
    var newId = options.newId;
    debugger;
    var typeName = options.typeName;
    var idFieldRegExp, idsFieldRegExp;
    // TODO handle humanIdS <<-- plural arrays.
    if (options.idFieldRegExp) {
        idFieldRegExp = options.idFieldRegExp;
    } else {
        var idField = typeName + 'Id';
        idFieldRegExp = new RegExp(idField + '$'); // TODO handle first letter capitalized. (and only first)
        var idsField = typeName + 'Ids';
        idsFieldRegExp = new RegExp(idField + '$'); // TODO handle first letter capitalized. (and only first)
    }
    var queriesAndUpdatesObject ={};
    _.each(DbObjectType.dbObjectTypes, function (dbObjectType) {
        var currentDbObjectTypeName = dbObjectType.typeName();
        var queries = [];
        var queryAndUpdateObject = {
            dbObjectType: dbObjectType,
            query:{ $or: queries },
            updates:[]
        };
        if (currentDbObjectTypeName == typeName) {
            queries.push({_id : id});
            // TODO: delete object?
            // verify replacement exists?
        }

        _.each(dbObjectType.prototype.propertyNames, function (propertyName) {
            if (propertyName.match(idFieldRegExp)) {
                // TODO: look at definition to see if typeName is supplied.
                var query = {};
                query[propertyName] = id;
                queries.push(query);
                var update = {
                    query: query,
                    update: {
                        $set: {}
                    }
                };
                update.update.$set[propertyName] = newId;
                queryAndUpdateObject.updates.push({
                    query: query,
                    update: update
                });
            }

            if (propertyName.match(idsFieldRegExp)) {
                // TODO: look at definition to see if typeName is supplied.
                var query = {};
                query[propertyName] = id;
                queries.push(query);
                var update = {
                    query: query,
                    update: {
                        $pull: {},
                        $push: {}
                    }
                };
                update.update.$pull[propertyName] = id;
                update.update.$push[propertyName] = newId;
                queryAndUpdateObject.updates.push({
                    query: query,
                    update: update
                });
            }
        });
        if (!_.isEmpty(queries)) {
            queriesAndUpdatesObject[currentDbObjectTypeName] = queryAndUpdateObject;
        }
    });
    return queriesAndUpdatesObject;
}
