/**
 * Pat: https://github.com/rauschma/enums
 
A simple enum implementation for JavaScript
===========================================

Usage example
-------------

    var color = new Enums.Enum("red", "green", "blue"); ( PAT: Enums notice capitalization change)
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
    function copyOwnFrom(target, source) {
        Object.getOwnPropertyNames(source).forEach(function(propName) {
            Object.defineProperty(target, propName,
                Object.getOwnPropertyDescriptor(source, propName));
        });
        return target;
    }
    
    function Symbol(name, props) {
        this.name = name;
        if (props) {
            copyOwnFrom(this, props);
        }
        if (!this.dbCode) {
            this.dbCode = name;
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
    Symbol.prototype.toJSONValue = Symbol.prototype.toJSON = function() {
        if ( this.dbCode ) {
            return this.dbCode;
        } else {
            return this.name;
        }
    };
    Object.freeze(Symbol.prototype);

    Enum = function (enumDefinitions) {
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
                throw new Meteor.Error("Duplicate dbCode:"+ enumDefinition.dbCode);
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
            }
        });
        _.extend(this, {
        // for Meteor db serialization
            toJSONValue: function(enumValue) {
                if (enumValue && typeof enumValue.toJSONValue === 'function') {
                    return enumValue.toJSONValue();
                } else if (_.isArray(enumValue)) {
                    var result = _.map(enumValue, that.toJSONValue);
                    return result;
                } else {
                    // might already be in the correct form.
                    return enumValue;
                }
            },
            fromJSONValue: function(rawJson) {
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
        if (sym instanceof Symbol) {
            return this[sym.name];
        } else if ( typeof sym === 'string' ) {
            var symbol = this[sym] || this.byDbCode[sym];
            return symbol;
        } else {
            return void(0);
        }
    }
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
