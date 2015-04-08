/**
 * Pat: https://github.com/rauschma/enums
 
A simple enum implementation for JavaScript
===========================================

Usage example
-------------

    var color = new Enums.Enum({
        red : {
            .... additional properties attached to the 'red' enum     
        },
        green : {
            .... additional properties attached to the 'green' enum     
        },
        blue : {
            .... additional properties attached to the 'blue' enum     
        },
    },
    function isGreen(c) {
        return c === color.green;
    }
    
Details: http://www.2ality.com/2011/10/enums.html


Running the unit tests
----------------------

    $ jasmine-node enums.spec.js
    
Details: http://www.2ality.com/2011/10/jasmine.html


Acknowledgements
----------------

- Main idea by Allen Wirfs-Brock
- Suggested improvements by Andrea Gianmarchi

 *
 * NOTE(dmr, 2015-03-25): "This pattern" refers to the (function(exports) { ... }) bit.
 *
 * Explanation of this pattern: http://www.2ality.com/2011/08/universal-modules.html
 * http://www.2ality.com/2011/11/module-gap.html
 * enums.js : special properties:
 *    name: human meaningful name use in code
 *    displayName: string to display to user.
 *    dbCode : code to stringify as


Enum.Symbol have a asDb() function that returns a { <typeName>: <dbCode> } - this is suitable for querying for a certain value in the db.
    For Example,
    AssetUploadStatus.done.asDb() ==> { 'assetUploadStatus': 'done' }
    AssetUploadStatus.done.asDb('different') ==> { 'different': 'done' }
    
    Enums when defined can now be new Enums.Enum({typeName:"<sometypename>", defs: { defs object }})
 */
var EJSON = Package.ejson.EJSON;
Enums = {};
(function (exports) {
    'use strict';
    function Symbol(name, source) {
        var self = this;
        this.name = name;
        self.propertyNames = [];
        if (source) {
            Object.getOwnPropertyNames(source).forEach(function(propName) {
                self.propertyNames.push(propName);
                Object.defineProperty(self, propName,
                    Object.getOwnPropertyDescriptor(source, propName));
            });
        }
        if (!this.dbCode) {
            this.dbCode = name;
            self.propertyNames.push('dbCode');
        }
    };
    /** We don't want the mutable Object.prototype in the prototype chain */
    Symbol.prototype = Object.create(null);
    Symbol.prototype.constructor = Symbol;
    /**
     * Without Object.prototype in the prototype chain, we need toString()
     * in order to display symbols. 
     * Unfortunately, javascript uses the toString() value if the Symbol is used as an object
     * index. For example:
     *       foo[enum] = "some value" is equivalent to foo[enum.toString()] = "some value" 
     * We would prefer when the enum.dbCode to be used as the index value
     * This also makes it easy to handle serialization by other means.
     */
    Symbol.prototype.toString = function () {
        if ( this.dbCode ) {
            return this.dbCode;
        } else {
            return this.name;
        }
    };
    Symbol.prototype.hasOwnProperty = function(propertyName) {
        return this.propertyNames.indexOf(propertyName) > -1;
    }
    Symbol.prototype.toJSONValue = Symbol.prototype.toJSON = function() {
        if ( this.dbCode ) {
            return this.dbCode;
        } else {
            return this.name;
        }
    };
    Object.defineProperties(Symbol.prototype, {
        // required for meteor serialization
        equals: {
            enumerable: false,
            writable: false,
            configurable: false,
            value: function (other) {
                if (other && 'dbCode' in other) {
                    return other.dbCode == this.dbCode;
                } else {
                    return false;
                }
            }
        },
        // required for meteor serialization.
        clone: {
            enumerable: false,
            writable: false,
            configurable: false,
            value: function () {
                // cannot really 'clone' enums -- but we want to avoid use of factory method.
                return this;
            }
        },
    });

    Object.freeze(Symbol.prototype);

    var Enum = function (enumDefinition) {
        var self = this;
        if ( enumDefinition == null || _.isEmpty(enumDefinition)) {
            throw new Error('No enum definition supplied');
        }
        if (_.isArray(enumDefinition )) {
            throw new Error('Must pass object not array');
        }
        var defTypeName = enumDefinition.typeName;
        var typeNameFn;
        if (_.isString(enumDefinition.typeName)) {
            typeNameFn = function () {
                return defTypeName;
            }
        } else if(_.isFunction(enumDefinition.typeName)) {
            typeNameFn = enumDefinition.typeName;
        } else if (enumDefinition.typeName != null) {
            throw new Error('typeName must be a string or function.');
        }
        var enumDefinitions;
        if ( typeNameFn == null && enumDefinition.defs == null ) {
            enumDefinitions = enumDefinition;
        } else if ( enumDefinition.defs != null) {
            enumDefinitions = enumDefinition.defs;
        } else {
            throw new Error("must pass object with keys: 'typeName', 'defs': passed ="+EJSON.stringify(enumDefinition));
        }
        var typeNameDef;
        if ( typeNameFn ) {
            typeNameDef = {
                // required to be function by meteor serialization
                typeName: {
                    enumerable: false,
                    writable: false,
                    configurable: false,
                    value: typeNameFn
                }
            };
            Object.defineProperties(this, typeNameDef);
            var typeName = typeNameFn.call(this);
            EJSON.addType(typeName, function(rawJson) {
                // TODO : security : need to hash _id, createdAt and any other immutables + secret salt to
                // make sure that immutables are not changed.
                // this is a little awkward because sometimes deserializing from db, sometimes from client:
                // when deserializing from db different params are allowed?
                // TODO: should this be a different function, since truly new construction is
                // different than recreation?
                var object = self.enumOf(rawJson);
                return object;
            });
        }
        var byDbCode = {};
        var symbols = [];
        function __createSymbol(name, enumDefinition) {
            if ( !('dbCode' in enumDefinition)) {
                enumDefinition.dbCode = name;
            }
            if ( !('displayName' in enumDefinition)) {
                enumDefinition.displayName = name.replace(/_/g, ' ');
            }
            if ( enumDefinition.dbCode in byDbCode ) {
                throw new Error("Duplicate dbCode:"+ enumDefinition.dbCode);
            }
            var symbol = new Symbol(name, enumDefinition);
            byDbCode[enumDefinition.dbCode] = symbol;
            symbols.push(symbol);
            Object.defineProperty(self, name, {
                enumerable: true,
                writable: false,
                configurable: false,
                value: symbol
            });
            var standardDbInstance;
            if ( typeNameFn != null ) {
                standardDbInstance = {};
                standardDbInstance[typeNameFn()] =symbol.dbCode;
                Object.freeze(standardDbInstance);
                Object.defineProperties(symbol, typeNameDef);
            }
            Object.defineProperties(symbol, {
                asDb: {
                    enumerable: false,
                    writable: false,
                    /**
                     * May be null ( use the typeName )
                     * @param dbField
                     * @returns {*}
                     */
                    value: function(dbField) {
                        var dbInstance = {};
                        if (_.isString(dbField)) {
                            dbInstance[dbField] = this.dbCode;
                            Object.freeze(dbInstance);
                        } else if ( standardDbInstance != null ) {
                            return standardDbInstance;
                        } else {
                            // throw ?
                        }
                        return dbInstance;
                    }
                }
            })
            Object.freeze(symbol);
        }
        if (arguments.length === 1 && enumDefinitions !== null && typeof enumDefinitions === "object") {
            Object.keys(enumDefinitions).forEach(function (name) {
                var enumDefinition = enumDefinitions[name];
                __createSymbol(name, enumDefinition);
            }, this);
        } else {
            Array.prototype.forEach.call(arguments, function (name) {
                __createSymbol(name, { });
            }, this);
        }

        Object.defineProperties(this, {
            byDbCode: {
                enumerable: false,
                writable: false,
                configurable: false,
                value: byDbCode
            },
            _symbols : {
                enumerable: false,
                writable: false,
                configurable: false,
                value: symbols
            },
            // required for meteor serialization ( see EJSON doc )
            toJSONValue: {
                enumerable: false,
                writable: false,
                configurable: false,
                value: function() {
                    var enumValue;
                    if (_.isGlobal(this)) {
                        // called with no this
                        return null;
                    } else if (this instanceof Enum) {
                        // called <Enum>.toJSONValue(value)
                        enumValue = arguments[0];
                    } else {
                        enumValue = this;
                    }

                    if ( enumValue == null ) {
                        return void(0);
                    } else if (_.isArray(enumValue)) {
                        var results = [];
                        // Note: self is defined in the external Enum function - and refers to the current function
                        _.each(enumValue, function(element) {
                            var result = self.toJSONValue.call(element);
                            if ( result != null) {
                                results.push(result);
                            }
                        });
                        return results;
                    } else if ( typeof enumValue === 'string' ) {
                        // might already be in the correct form.
                        var symbol = self.enumOf(enumValue);
                        if ( symbol ) {
                            // yeah success at recovering
                            return symbol.dbCode;
                        }
                    } else if ( typeof enumValue.dbCode === 'string') {
                        // the Enum got serialized as an object? lets pick out the dbCode and see if it is a good code.
                        var symbol = self.enumOf(enumValue.dbCode);
                        if ( symbol ) {
                            // yeah success at recovering
                            return symbol.dbCode;
                        }
                    }
                    // give up.
                    return void(0);
                }
            },
            fromJSONValue: {
                enumerable: false,
                writable: false,
                configurable: false,
                value: function (rawJson) {
                    var result;
                    if (rawJson == null) {
                        result = null;
                    } else if (_.isArray(rawJson)) {
                        result = _.map(rawJson, self.fromJSONValue);
                    } else {
                        result = self.enumOf(rawJson);
                    }
                    return result;
                }
            }
        });
        Object.freeze(this);
    }
    _.extend(Enum.prototype, {
        symbols: function () {
            return this._symbols.slice(0);
        },
        /**
         *
         * @param sym a string that corresponds to the key or the dbCode in a instance of this enumeration.
         * @returns {boolean}
         */
        contains: function (sym) {
            if (typeof sym === 'string') {
                return sym in this || sym in this.byDbCode;
            } else if (sym instanceof Symbol) {
                return this[sym.name] === sym;
            } else {
                return false;
            }
        },
        /**
         *
         * @param sym
         * @returns {*}
         */
        enumOf: function (sym) {
            var symbol = void(0);
            if (sym) {
                if (sym instanceof Symbol) {
                    symbol = this[sym.name];
                } else if (typeof sym === 'string') {
                    symbol = this[sym] || this.byDbCode[sym];
                } else if (typeof sym.dbCode === 'string') {
                    // happens if the symbol was accidently converted to a regular object.
                    symbol = this.byDbCode[sym.dbCode];
                }
            }
            return symbol;
        },
        /**
         * Convert an array of dbCode values to an array of Symbol objects. Useful for deseralization.
         * @param inputArray
         * @returns {Array}
         */
        toArray: function (inputArray) {
            var self = this;
            var outputArray = _.map(inputArray, function (element) {
                return self.enumOf(element);
            });
            return outputArray;
        },
        arrayify: function (objectWithSymbolKeys) {
            var result = [];
            var index = 0;
            _.each(objectWithSymbolKeys, function (value, key) {
                var symbolKey = Enum.prototype.enumOf(key) || key;
                var symbolValue = Enum.prototype.enumOf(value) || value;
                result.push({key: symbolKey, value: symbolValue, index: index++});
            });
            return result;
        },
        toDbArray: function() {
            var dbArray = [];
            var args = [].concat(Array.prototype.slice.call(arguments,0));
            var dbArray = _.map(args, function(arg) {
                return arg.dbCode;
            });
            return dbArray;
        },
        /**
         * @param fieldName, enum1, enum2, ....
         */
        inMongoDb: function() {
            var enums, fieldName;
            if ( _.isString(arguments[0]) ) {
                fieldName = arguments[0];
                enums = Array.prototype.slice.call(arguments,1);
            } else if ( this.typeName ) {
                enums = Array.prototype.slice.call(arguments,0);
                fieldName = this.typeName();
            } else {
                throw Error("Must supply field Name since enum has no typeName defined.");
            }
            var dbArray = this.toDbArray(enums);
            var result = {};
            result[fieldName] = { $in: dbArray};
            return result;
        },
        /**
         * @param fieldName, enum1, enum2, ....
         */
        ninMongoDb: function() {
            var enums, fieldName;
            if ( _.isString(arguments[0]) ) {
                fieldName = arguments[1];
                enums = Array.prototype.slice.call(arguments,1);
            } else if ( this.typeName ) {
                enums = Array.prototype.slice.call(arguments,0);
                fieldName = this.typeName();
            } else {
                throw Error("Must supply field Name since enum has no typeName defined.");
            }
            var dbArray = this.toDbArray(enums);
            var result = {};
            result[fieldName] = { $nin: dbArray};
            return result;
        }
    });
    exports.Enum = Enum;
    exports.Symbol = Symbol;
//}(typeof exports === "undefined" ? this.enums = {} : exports)); // PAT original call
}(Enums));
