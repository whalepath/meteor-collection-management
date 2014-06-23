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
    deep: function (obj, key, value) {

        var keys = key.replace(/\[(["']?)([^\1]+?)\1?\]/g, '.$2').replace(/^\./, '').split('.'),
            root,
            i = 0,
            n = keys.length;

        // Set deep value
        if (arguments.length > 2) {

            root = obj;
            n--;

            while (i < n) {
                key = keys[i++];
                obj = obj[key] = _.isObject(obj[key]) ? obj[key] : {};
            }

            obj[keys[i]] = value;

            value = root;

            // Get deep value
        } else {
            while ((obj = obj[keys[i++]]) != null && i < n) {};
            value = i < n ? void 0 : obj;
        }

        return value;
    }

});



// Usage:
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

_.mixin({
    pluckDeep: function (obj, key) {
        return _.map(obj, function (value) { return _.deep(value, key); });
    }
});

_.mixin({

    // Return a copy of an object containing all but the blacklisted properties.
    unpick: function (obj) {
        obj || (obj = {});
        return _.pick(obj, _.difference(_.keys(obj), _.flatten(Array.prototype.slice.call(arguments, 1))));
    }

});

// -------------------

_.mixin({
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
    }
});
