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
 * Explanation of this pattern: http://www.2ality.com/2011/08/universal-modules.html
 * http://www.2ality.com/2011/11/module-gap.html
 * enums.js : special properties:
 *    name: human meaningful name use in code
 *    displayName: string to display to user.
 *    dbCode : code to stringify as
 */
Enums = {};
(function (exports) {
    'use strict';
    function Symbol(name, source) {
        var that = this;
        this.name = name;
        that.propertyNames = [];
        if (source) {
            Object.getOwnPropertyNames(source).forEach(function(propName) {
                that.propertyNames.push(propName);
                Object.defineProperty(that, propName,
                    Object.getOwnPropertyDescriptor(source, propName));
            });
        }
        if (!this.dbCode) {
            this.dbCode = name;
            that.propertyNames.push('dbCode');
        }
        Object.freeze(this);
    }
    /** We don't want the mutable Object.prototype in the prototype chain */
    Symbol.prototype = Object.create(null);
    Symbol.prototype.constructor = Symbol;
    /**
     * Without Object.prototype in the prototype chain, we need toString()
     * in order to display symbols.
     */
    Symbol.prototype.toString = function () {
        if ( this.displayName ) {
            return this.displayName;
        } else {
            return "|"+this.name+"|";
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
    Object.freeze(Symbol.prototype);

    var Enum = function (typeNameParam, enumDefinitionsParam) {
        var argIndex = 0;
        // TODO: finish defining the EJSON addType
        if (_.isString(typeNameParam) ) {
            typeName = typeNameParam;
            argIndex++;
        }
        var enumDefinitions = [].concat(Array.prototype.slice(arguments, argIndex));
        var that = this;
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
                throw new Meteor.Error(500, "Duplicate dbCode:"+ enumDefinition.dbCode);
            }
            var symbol = new Symbol(name, enumDefinition);
            byDbCode[enumDefinition.dbCode] = symbol;
            symbols.push(symbol);
            Object.defineProperty(that, name, {
                enumerable: true,
                writable: false,
                configurable: false,
                value: symbol
            });
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
                        // Note: that is defined in the external Enum function - and refers to the current function
                        _.each(enumValue, function(element) {
                            var result = that.toJSONValue.call(element);
                            if ( result != null) {
                                results.push(result);
                            }
                        });
                        return results;
                    } else if ( typeof enumValue === 'string' ) {
                        // might already be in the correct form.
                        var symbol = that.enumOf(enumValue);
                        if ( symbol ) {
                            // yeah success at recovering
                            return symbol.dbCode;
                        }
                    } else if ( typeof enumValue.dbCode === 'string') {
                        // the Enum got serialized as an object? lets pick out the dbCode and see if it is a good code.
                        var symbol = that.enumOf(enumValue.dbCode);
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
                        result = _.map(rawJson, that.fromJSONValue);
                    } else {
                        result = that.enumOf(rawJson);
                    }
                    return result;
                }
            }
        });
        Object.freeze(this);
    }
    Enum.prototype.symbols = function() {
        return this._symbols.slice(0);
    }
    /**
     *
     * @param sym a string that corresponds to the key or the dbCode in a instance of this enumeration.
     * @returns {boolean}
     */
    Enum.prototype.contains = function(sym) {
        if ( typeof sym === 'string' ) {
            return sym in this || sym in this.byDbCode;
        } else if (sym instanceof Symbol) {
            return this[sym.name] === sym;
        } else {
            return false;
        }
    }
    /**
     *
     * @param sym
     * @returns {*}
     */
    Enum.prototype.enumOf = function(sym) {
        var symbol = void(0);
        if ( sym ) {
            if (sym instanceof Symbol) {
                symbol = this[sym.name];
            } else if ( typeof sym === 'string' ) {
                symbol = this[sym] || this.byDbCode[sym];
            } else if ( typeof sym.dbCode === 'string') {
                // happens if the symbol was accidently converted to a regular object.
                symbol = this.byDbCode[sym.dbCode];
            }
        }
        return symbol;
    }
    /**
     * Convert an array of dbCode values to an array of Symbol objects. Useful for deseralization.
     * @param inputArray
     * @returns {Array}
     */
    Enum.prototype.toArray = function(inputArray) {
        var that = this;
        var outputArray = _.map(inputArray, function(element) {
            return that.enumOf(element);
        });
        return outputArray;
    }
    Enum.prototype.toString = function() {
        return this.displayName;
    }
    exports.Enum = Enum;
    exports.Symbol = Symbol;
//}(typeof exports === "undefined" ? this.enums = {} : exports)); // PAT original call
}(Enums));
