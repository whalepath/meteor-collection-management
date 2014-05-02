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
<SubClass> = function() {
    DbObjectType.apply(this, arguments);
};
DbObjectType.createSubClass(<SubClass>, 'typename', [ propertyNames ... ], 'collectionName');

 *
 */
DbObjectType = function(propertyValues){
    var that = this;
    if ( arguments.length == 1 && arguments[0] instanceof Object) {
        this.fromJSONValue(arguments[0]);
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
 * If the propertyList contains 'humanId' then the generated collection has 2 additional methods:
 *    * findOneByHumanId - returns a single object referenced by the humanId
 *    * findByHumanId -
 *          1. primary use is on server side when returning a cursor in a pub/sub
 *          2. or if multiple objects can be returned.
 *
 * @param subClassType
 * @param propertyNames declare the properties that the EJSON code will care about.
 * @param databaseTableName -- NOTE: To avoid inadvertantly accidentally changing the database table names ( very! bad! )
 * pass in the databaseTableName as a separate string
 * @returns {*}
 */
DbObjectType.createSubClass = function(subClassType, typeName, propertyNames, databaseTableName) {
    propertyNames = propertyNames || [];
    // HACK SECURITY these properties must only be set on the server : any values from client are suspect
    propertyNames.push('_id', 'createdAt');

    subClassType.prototype = Object.create(DbObjectType.prototype, {
        propertyNames: {
            writable :false,
            value : propertyNames
        },
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
    subClassType.prototype.constructor = subClassType;

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
        // both have their conviniences.
        subClassType.databaseTable = dbCollection;
        _.extend(subClassType.databaseTable, {
            findById: function(id) {
                if ( id ) {
                    return this.find({_id:id});
                } else {
                    return null;
                }
            },
            findOneById: function(id) {
                var cursor = this.findById(id);
                if ( cursor ) {
                    return cursor.fetch()[0];
                } else {
                    return null;
                }
            }
        });
        if (_.contains(propertyNames, 'humanId')) {
            // add in the special queries if humanId specified
            _.extend(dbCollection, {
                findOneByHumanId: function(humanId) {
                    if ( humanId ) {
                        return dbCollection.findOne({humanId:humanId});
                    } else {
                        return null;
                    }
                },
                // returns a Cursor for use in pub/sub
                findByHumanId: function(humanId) {
                    if ( humanId ) {
                        return dbCollection.find({humanId:humanId});
                    } else {
                        return null;
                    }
                }
            });
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
    // look for keys that will be ignored
    checkKeys: function(object) {
        _.onlyKeysCheck(object, null, this.propertyNames);
    },
    /**
     * our standard save method.
     * @private
     */
    _save: function() {
        // TODO: I had problems with upsert (don't remember exactly what they were)
        try {
            _.onlyKeysCheck(this, null, this.propertyNames);
        } catch(e){
            console.log("While saving a db record:"+ e.message);
        }
        if ( this._id ) {
            this.databaseTable.update({_id: this._id}, this.toJSONValue());
        } else {
            var _id = this.databaseTable.insert(this.toJSONValue());
            this._id = _id;
            this._makePropertyImmutable('_id');
        }
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


