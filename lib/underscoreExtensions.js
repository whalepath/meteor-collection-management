// https://gist.github.com/furf/3208381

// Usage:
//
// var obj = {
//   a: {
//     b: {
//       c: {
//         d: ['e', 'f', 'g']
//       }
//     }
//   }
// };
//
// Get deep value
// _.deep(obj, 'a.b.c.d[2]'); // 'g'
//
// Set deep value
// _.deep(obj, 'a.b.c.d[2]', 'george');
//
// _.deep(obj, 'a.b.c.d[2]'); // 'george'

_.mixin({

    // Get/set the value of a nested property
    deep: function (baseObj, complexKey, value) {
        function __createObject(key) {
            var keyNumber = Number(key);
            if (_.isNaN(keyNumber)) {
                return {};
            } else {
                return [];
            }
        }
        if ( baseObj != null || arguments.length > 2) {
            var obj = baseObj;
            var key = complexKey;
            var keys = key.replace(/\[(["']?)([^\1]+?)\1?\]/g, '.$2').replace(/^\./, '').split('.'),
                root,
                i = 0,
                n = keys.length;

            // Set deep value
            if (arguments.length > 2) {

                root = obj;
                if ( root == null) {
                    root = obj = __createObject(keys[i]);
                }
                n--;
                while (i < n) {
                    key = keys[i++];
                    if ( obj[key] == null) {
                        obj = obj[key] = __createObject(keys[i]);
                    } else {
                        obj = obj[key];
                    }
                }

                obj[keys[i]] = value;

                return root;

                // Get deep value
            } else {
                while ((obj = obj[keys[i++]]) != null && i < n) {
                }
                var result = i < n ? void 0 : obj;
                return result;
            }
        }
    },

    /**
     *

    Usage:
//
// var arr = [{
//   deeply: {
//     nested: 'foo'
//   }
// }, {
//   deeply: {
//     nested: 'bar'
//   }
// }];
//
// _.pluckDeep(arr, 'deeply.nested'); // ['foo', 'bar']
     */
    pluckDeep: function (obj, key) {
        return _.map(obj, function (value) { return _.deep(value, key); });
    },
    /**
     * Return a copy of an object containing all but the blacklisted properties.
     * @param obj
     * @param keys...
     * @returns {*}
     */
    unpick: function (obj) {
        if ( obj == null) {
            return {};
        } else {
            return _.pick(obj, _.difference(_.keys(obj), _.flatten(Array.prototype.slice.call(arguments, 1))));
        }
    },
    // TODO : in future return check the type as well
    onlyKeysCheck:function(obj, required, optional) {
        if(obj == null) {
            throw new Error("onlyKeysCheck: null source object");
        } else if (_.isEmpty(required) && _.isEmpty(optional)) {
            throw new Error("onlyKeysCheck: doing check with no required or optional parameters supplied");
        }
        var objKeys = _.keys(obj);
        var foundRequired;
        var extraKeys;
        if ( !_.isEmpty(required)) {
            foundRequired = _.intersection(objKeys, required);
            if ( foundRequired.length != required.length) {
                throw new Error("missing required keys :"+JSON.stringify(_.difference(required, foundRequired)));
            }
            extraKeys = _.difference(objKeys, foundRequired);
        } else {
            extraKeys = objKeys;
        }
        if ( !_.isEmpty(optional)) {
            extraKeys = _.difference(extraKeys, optional);
        }
        if ( !_.isEmpty(extraKeys)) {
            throw new Error("These extra keys were found:"+ extraKeys+ ", but only required keys("+required+ "); and optional keys("+ optional+") are allowed");
        }
    },
    /**
     *
     * @param obj
     * @param required - keys that must be present
     * @param optional - keys that may be present
     * @returns {*} object with just the required / optional key/value pairs
     */
    pickRequired: function(obj, required, optional) {
        if(obj == null) {
            throw new Error("null source object in paramsCheck");
        } else if (_.isEmpty(required) && _.isEmpty(optional)) {
            throw new Error("onlyKeysCheck: doing check with no required or optional parameters supplied");
        }
        var result;
        var objKeys = _.keys(obj);
        var extraKeys;
        if ( !_.isEmpty(required)) {
            result = _.pick(obj, required);
        } else {
            result = {};
        }
        if (!_.isEmpty(optional)) {
            _.extend(result, _.pick(obj, optional));
        }
        _.onlyKeysCheck(result, required, optional);
        return result;
    },

    /**
     * return the value indexed by requiredKey. The value must exist otherwise exception is thrown.
     * @param obj must be not-null
     * @param requiredKey
     */
    must: function(obj, requiredKey) {
        if ( !obj || !requiredKey) {
            throw new Error('must: passed null object or null requiredKey. requiredKey='+requiredKey);
        } else if( !obj[requiredKey] ) {
            throw new Error('must: object does not have requiredKey('+requiredKey+') set to a value');
        }
        return obj[requiredKey];
    },
    deepFreeze: function(o) {
        var prop, propKey;
        Object.freeze(o); // First freeze the object.
        for (propKey in o) {
            prop = o[propKey];
            if (o.hasOwnProperty(propKey) && prop instanceof Object && !Object.isFrozen(prop)) {
                // If the object is on the prototype, not an object, or is already frozen,
                // skip it. Note that this might leave an unfrozen reference somewhere in the
                // object if there is an already frozen object containing an unfrozen object.
                deepFreeze(prop); // Recursively call deepFreeze.
            }
        }
    },
    /**
     * Used to see if a function was called with no 'this' parameter
     * @param that - the 'this' being checked
     * @returns {boolean} true if that is the global.
     */
    isGlobal: function(that) {
        return that === _.getGlobal();
    },
    // http://stackoverflow.com/questions/3277182/how-to-get-the-global-object-in-javascript
    getGlobal: function() {
        function __returnGlobal() { return this; }
        var global;
        try {
            global = window || GLOBAL;
        } catch(e) {
        }
        if ( global == null) {
            global = __returnGlobal();
        }
        if ( global == null) {
            try {
                // a function that is running in non-strict mode
                global = new Function('return this')();
            } catch( e) {
                debugger;
                // can fail in chrome : Exception in template helper:
                // EvalError: Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: "script-src 'self' 'unsafe-inline'".
            }
        }

        if ( global == null ) {
            if ( console ) {
                (console.warn||console.log).call(console,'>>hack to get global has stopped working, global is still null. Returning empty object to avoid worse breaks.');
            }
            return {};
        } else {
            return global;
        }
    }
});
