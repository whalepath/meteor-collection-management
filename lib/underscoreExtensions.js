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

    // TODO: make a deepSet to allow for explicit set /get operations.
    // Get/set the value of a nested property
    deep: function (baseObj, complexKey, value) {
        var settingValue = arguments.length > 2;
        function __createObject(key) {
            var keyNumber = Number(key);
            if (_.isNaN(keyNumber)) {
                return {};
            } else {
                return [];
            }
        }
        function __splitKey(keyStr) {
            // TODO: document the need for this regex
            var subKeyArray = keyStr.replace(/\[(["']?)([^\1]+?)\1?\]/g, '.$2').replace(/^\./, '').split('.');
            return subKeyArray;
        }
        if ( baseObj != null || settingValue) {
            var obj = baseObj;
            var key = complexKey;
            var keys = [];
            if ( key instanceof Array) {
                key.forEach(function(subKey) {
                    var subKeyArray = __splitKey(subKey);
                    keys = keys.concat(subKeyArray);
                });
            } else {
                keys = __splitKey(key);
            }
            var root,
                i = 0,
                n = keys.length;

            // Set deep value
            if (settingValue) {

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
    // reduce a deep object to a single object with '.' keys. ( useful for mongo update ($set ) )
    flattenObj: function flattenObj(obj, prefixKey, baseObject) {
        var baseObj;
        if ( baseObject == null ) {
            if (obj instanceof Array) {
                baseObj = [];
            } else {
                baseObj = {}
            }
        } else {
            baseObj = baseObject;
        }
        var prefix = prefixKey? prefixKey+'.' : '';
        _.each(obj, function(value, key) {
            if (value == null || typeof value != "object") {
                baseObj[prefix+key] = value;
            } else {
                var flatten = flattenObj(value, prefix+key, baseObj);
            }
        });
        return baseObj;
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
     * _.pickRequired(obj, [ <required_key_names> ], [ <optional_key_names> ] )
     *
     * OR
     *
     * _.pickRequired(obj, 'required_key_1', 'required_key_2', 'required_key_3', ... 'required_key_n')
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
        var requiredKeys;
        if (_.isArray(required)) {
            requiredKeys = required;
            optionalKeys = _.isArray(optional)? optional: Array.prototype.slice.call(arguments, 2);
        } else {
            requiredKeys = Array.prototype.slice.call(arguments, 1);
            optionalKeys = [];
        }
        if ( !_.isEmpty(requiredKeys)) {
            result = _.pick(obj, requiredKeys);
        } else {
            result = {};
        }
        if (!_.isEmpty(optionalKeys)) {
            _.extend(result, _.pick(obj, optionalKeys));
        }
        _.onlyKeysCheck(result, requiredKeys, optionalKeys);
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
