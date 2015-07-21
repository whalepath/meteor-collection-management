/**
 * Pat: https://github.com/rauschma/enums
 
A simple enum implementation for JavaScript
===========================================

Usage example
-------------

    var color = new Enums.Enum({
        typeName: <string>/<function> - used for meteor serialization.
        defs: {
            red : {
                .... additional properties attached to the 'red' enum
            },
            green : {
                .... additional properties attached to the 'green' enum
            },
            blue : {
                .... additional properties attached to the 'blue' enum
            }
        },
        properties: {
        // additional properties that the enum needs attached to the generated
        // enum object (see Object.defineProperties )
        },
        afterSymbolsFn(enumDefinition): // function run after symbols are created (and before it is frozen)
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


Enum.Symbol have a asMongoDb() function that returns a { <typeName>: <dbCode> } - this is suitable for querying for a certain value in the db.
    For Example,
    AssetUploadStatus.done.asMongoDb() ==> { 'assetUploadStatus': 'done' }
    AssetUploadStatus.done.asMongoDb('different') ==> { 'different': 'done' }
    
    Enums when defined can now be new Enums.Enum({typeName:"<sometypename>", defs: { defs object }})
 */
var EJSON = Package.ejson.EJSON;
Enums = {};
(function (exports) {
    'use strict';
    var declaredEnums = {};
    Enums.getDeclaredEnum = function(typeName) {
        return declaredEnums[typeName];
    };
    function Symbol(name, source) {
        var self = this;
        this.name = name;
        Object.defineProperties(self, {
            propertyNames: {
                value: [],
                enumerable: false,
                writable: false,
                configurable: false
            }
        });
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

    var Enum = function (options) {
        var self = this;
        var selfEnumObject = this;
        if ( options == null || _.isEmpty(options)) {
            throw new Error('No enum definition supplied');
        }
        if (_.isArray(options )) {
            throw new Error('Must pass object not array');
        }
        var enumDefinition;
        if ( 'typeName' in options || 'defs' in options || 'properties' in options ) {
            enumDefinition = options;
        } else {
            enumDefinition = {
                defs: options
            };
        }

        var defTypeName = enumDefinition.typeName;
        var typeNameFn;
        var typeName = null; // so not undefined
        var symbolDefinitions = enumDefinition.defs;
        if ( symbolDefinitions == null) {
            throw new Error("must pass object with keys: 'defs': passed ="+EJSON.stringify(enumDefinition));
        }
        // extra properties to attach to the generated enum.prototype
        var properties = enumDefinition.properties;

        if (_.isString(defTypeName)) {
            typeNameFn = function () {
                return defTypeName;
            }
        } else if(_.isFunction(defTypeName)) {
            typeNameFn = defTypeName;
        } else if (defTypeName != null) {
            throw new Error('typeName must be a string or function if set.');
        }

        var typeNameDef;
        if ( typeNameFn ) {
            typeName = typeNameFn.call(this);
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
        function __createSymbol(name, symbolDefinition) {
            if ( !('dbCode' in symbolDefinition)) {
                symbolDefinition.dbCode = name;
            }
            if ( !('displayName' in symbolDefinition)) {
                symbolDefinition.displayName = name.replace(/_/g, ' ');
            }
            if ( symbolDefinition.dbCode in byDbCode ) {
                throw new Error("Duplicate dbCode:"+ symbolDefinition.dbCode);
            }
            var symbol = new Symbol(name, symbolDefinition);
            byDbCode[symbolDefinition.dbCode] = symbol;
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
                asMongoDb: {
                    enumerable: false,
                    writable: false,
                    /**
                     * May be null ( use the typeName )
                     * @param dbField
                     * @returns {*}
                     */
                    value: function (dbField) {
                        var dbInstance = {};
                        if (arguments.length == 0 && standardDbInstance != null) {
                            return standardDbInstance;
                        } else if (_.isString(dbField)) {
                            dbInstance[dbField] = this.dbCode;
                            Object.freeze(dbInstance);
                        } else {
                            throw new Error('must be no arguments or first argument must be a string');
                        }
                        return dbInstance;
                    }
                },
                inMongoDb: {
                    enumerable: false,
                    writable: false,
                    /**
                     * May be null ( use the typeName )
                     * @param dbField
                     * @returns {*}
                     */
                    value: function () {
                        var self = this;
                        if (arguments.length == 0) {
                            return self.asMongoDb();
                        } else {
                            var args = Array.prototype.slice.call(arguments, 0);
                            args.push(self);
                            return selfEnumObject.inMongoDb.apply(selfEnumObject, args);
                        }
                    }
                },
                ninMongoDb: {
                    enumerable: false,
                    writable: false,
                    /**
                     * May be null ( use the typeName )
                     * @param dbField
                     * @returns {*}
                     */
                    value: function () {
                        var self = this;
                        var args = Array.prototype.slice.call(arguments, 0);
                        args.push(self);
                        return selfEnumObject.ninMongoDb.apply(selfEnumObject, args);
                    }
                }
            });
            if ( properties != null ) {
                // properties from the top-level enumDefinition
                Object.defineProperties(symbol, properties);
            }
            Object.freeze(symbol);
        }
        if (arguments.length === 1 && symbolDefinitions !== null && typeof symbolDefinitions === "object") {
            Object.keys(symbolDefinitions).forEach(function (name) {
                var symbolDefinition = symbolDefinitions[name];
                __createSymbol(name, symbolDefinition);
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
            // TODO: Handle arrays.
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
        if ( properties != null ) {
            Object.defineProperties(this, properties);
        }
        if ( _.isFunction(enumDefinition.afterSymbolsFn)) {
            enumDefinition.afterSymbolsFn.call(this, enumDefinition);
        } else if (enumDefinition.afterSymbolsFn != null) {
            throw new Error("enum:"+typeName+":'afterSymbolsFn' must be a function if set.");
        }
        Object.freeze(this);
        if ( typeName ) {
            declaredEnums[typeName] = this;
        }
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
            var outputArray;
            if ( inputArray == null ) {
                outputArray = [];
            } else if ( inputArray instanceof Array ) {
                outputArray = _.map(inputArray, function (element) {
                    return self.enumOf(element);
                });
            } else {
                outputArray = [ self.enumOf(inputArray) ];
            }
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
        // convert array or arguments to a unique array of dbCodes
        toDbArray: function() {
            var dbArray = [];
            var args;
            if ( _.isArray(arguments[0])) {
                args = arguments[0];
            }else {
                args = Array.prototype.slice.call(arguments, 0);
            }

            var dbArray = [];
            _.each(args, function(arg) {
                if ( arg && arg.dbCode) {
                    dbArray.push(arg.dbCode);
                }
            });
            dbArray = _.unique(dbArray);
            return dbArray;
        },
        /**
         * <enum>.inMongoDb(enum1) ->  { <typeName> : dbCode1 }
         * <enum>.inMongoDb(fieldName, enum1) ->  { <fieldName> : dbCode1 }
         * <enum>.inMongoDb(fieldName, enum1, enum2, ..) ->  {$in : [ dbcode1, dbCode2, ... ] }}
         */
        inMongoDb: function() {
            var enums, fieldName;
            if ( _.isString(arguments[0]) ) {
                fieldName = arguments[0];
                enums = Array.prototype.slice.call(arguments,1);
            } else if ( this.typeName ) {
                // allow a null as the first argument so caller can guarantee that rest of arguments
                // are handled correctly.
                enums = Array.prototype.slice.call(arguments,arguments[0]==null?1:0);
                fieldName = this.typeName();
            } else {
                throw Error("Must supply field Name since enum has no typeName defined.");
            }
            var dbArray = this.toDbArray.apply(this, enums);
            var result = {};
            switch(dbArray.length) {
            case 0:
                break;
            case 1:
                // degenerate 1 element
                result[fieldName] = dbArray[0];
                break;
            default:
                // note: we handle the 0 length by generating a {$in:[]} to avoid accidental all-inclusion.
                result[fieldName] = {$in: dbArray};
            }
            return result;
        },
        /**
         * @param fieldName, enum1, enum2, ....
         */
        ninMongoDb: function() {
            var enums, fieldName;
            if ( _.isString(arguments[0]) ) {
                fieldName = arguments[0];
                enums = Array.prototype.slice.call(arguments,1);
            } else if ( this.typeName ) {
                // allow a null as the first argument so caller can guarantee that rest of arguments
                // are handled correctly.
                enums = Array.prototype.slice.call(arguments,arguments[0]==null?1:0);
                fieldName = this.typeName();
            } else {
                throw Error("Must supply field Name since enum has no typeName defined.");
            }
            var dbArray = this.toDbArray.apply(this, enums);
            var result = {};
            switch(dbArray.length) {
            case 0:
                break;
            case 1:
                // degenerate 1 element
                result[fieldName] = { $ne :dbArray[0] };
                break;
            default:
                // note: we handle the 0 length by generating a {$nin:[]} to avoid accidental all-inclusion.
                result[fieldName] = {$nin: dbArray};
            }
            return result;
        },
        createKeyedMap: function(elementFn) {
            var keyedMap = {};
            var _elementFn;
            if ( elementFn == null) {
                _elementFn = function() { return []; };
            } else {
                _elementFn = elementFn;
            }
            _.each(this.symbols(), function(symbol) {
                keyedMap[symbol] = _elementFn.apply(symbol, null);
            });
            return keyedMap;
        }
    });
    exports.Enum = Enum;
    exports.Symbol = Symbol;
//}(typeof exports === "undefined" ? this.enums = {} : exports)); // PAT original call
}(Enums));
