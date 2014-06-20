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
        Object.freeze(this);
    }
    /** We don’t want the mutable Object.prototype in the prototype chain */
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
    Symbol.prototype.toJSON = function() {
        if ( this.dbCode ) {
            return this.dbCode;
        } else {
            return this.name;
        }
    };
    Object.freeze(Symbol.prototype);

    Enum = function (obj) {
        if (arguments.length === 1 && obj !== null && typeof obj === "object") {
            Object.keys(obj).forEach(function (name) {
                this[name] = new Symbol(name, obj[name]);
            }, this);
        } else {
            Array.prototype.forEach.call(arguments, function (name) {
                this[name] = new Symbol(name);
            }, this);
        }
        Object.freeze(this);
    }
    Enum.prototype.symbols = function() {
        return Object.keys(this).map(
            function(key) {
                return this[key];
            }, this
        );
    }
    Enum.prototype.contains = function(sym) {
        if ( typeof sym === 'string' ) {
             return sym in this;
        } else if (sym instanceof Symbol) {
             return this[sym.name] === sym;
        } else {
             return false;
        }
    }
    Enum.prototype.enumOf = function(sym) {
        if ( typeof sym === 'string' ) {
             return this[sym];
        } else if (sym instanceof Symbol) {
             return this[sym.name];
        } else {
             return void(0);
        }
    }
    exports.Enum = Enum;
    exports.Symbol = Symbol;
//}(typeof exports === "undefined" ? this.enums = {} : exports)); // PAT original call
}(Enums));
