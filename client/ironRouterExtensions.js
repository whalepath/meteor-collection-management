// TODO: put in a pull request to iron-router
// this works but can we use a global hook that for a given route does a universal lookup.

if ( Router != null) {
    function oneFn() {
        'use strict';
        var result;
        if ( this == null) {
            return this;
        }
        if (typeof this.findOne === 'function' ) {
            // mcm handles
            result = this.findOne();
            return result;
        }

        if ( typeof this.fetch === 'function') {
            // Mongo cursor
            result = this.fetch();
        } else {
            // something which could be an array
            result = this;
        }
        if (_.isArray(result) ) {
            result = result[0];
        }
        return result;
    }
    function manyFn() {
        'use strict';
        var result;
        if ( this == null ) {
            return this;
        }
        if (typeof this.findFetch === 'function' ) {
            // mcm handles
            result = this.findFetch();
        } else if ( typeof this.fetch === 'function') {
            // Mongo cursor
            result = this.fetch();
        } else {
            // This is not an error, maybe the dev passed an array - but still valid use case if a
            // non-mongo cursor was passed. - just play nice
            result = this;
        }
        return result;
    }

    /**
     * A standard data() that will be called by the Router code to get the template's data.
     * This function will be used by the Router code.
     *
     * Utilizes a user-defined initializeData() function to get the Meteor topics handles (or other
     * data objects)
     *
     * initializeData(params) must return:
     *    { <desired-context-key-1> : { handle: <handle1: some-object-with-ready>, method:
     *    <method1:function name to be run on object> },
     *    <desired-context-key-2> : { handle: <handle2: some-object-with-ready>, method:
     *    <method2:function> },
     *    <desired-context-key-3> : { handle: <handle3: some-object> },
     *    <desired-context-key-4> : <handle4:some-object> },
     *
     * @returns { <desired-context-key-1>: handle1[method1](),
     *            <desired-context-key-2>: method2.call(handle2),
     *            <desired-context-key-3> : { handle: <handle3: some-object> },
     *            <desired-context-key-4> : handle4
     *          }
     */
    Template.prototype.data = function() {
        'use strict';
        var initializeData;
        // TO_PAT(2014-11-14): what does this alternative mean? In most cases, we have helper
        // functions on the tmpl itself, but we take the first path.
        if ( this.route != null) {
            //we are being called by the iron:router code
            initializeData = this.route.options.initializeData;
        } else {
            // template helper functions are on the template itself
            initializeData = this.initializeData;
        }

        if ( initializeData ) {
            var initialData;
            if ( typeof initializeData ==='function' ) {
                var router = Router.current(true);
                var params;
                if ( router && router.params) {
                    params = router.params;
                } else {
                    params = {};
                }
                initialData = initializeData(params);
            } else {
                initialData = initializeData;
            }
            var result = {};
            _.each(initialData, function(handleObj, key) {
                var isHandleAndMethod;
                try {
                    isHandleAndMethod = handleObj != null && 'handle' in handleObj && 'method' in handleObj;
                } catch(e) {
                    // string or something else
                    isHandleAndMethod = false;
                }
                var recipientObj = isHandleAndMethod? handleObj.handle : handleObj;
                var isOneKey = key.length > 3 && key.substring(key.length-3, key.length) == 'One';
                if ( recipientObj == null ) {
                    // null or undefined handleObj or handle.handleObj is null or undefined
                    result[key] = recipientObj;
                    if ( isOneKey ) {
                        result[key.substring(0, key.length - 3)] = recipientObj;
                    }
                } else if ( isHandleAndMethod ) {
                    switch(typeof handleObj.method) {
                    case 'undefined':
                        throw new Meteor.Error(500, "For key=" + key + ": 'method' is undefined in handleObj");
                        break;
                    case 'string':
                        if (typeof recipientObj[handleObj.method] === 'function') {
                            result[key] = recipientObj[handleObj.method]();
                        } else {
                            throw new Meteor.Error(500, "For key=" + key + ": 'method'=" + handleObj.method + " is not a function on recipientObj");
                        }
                        break;
                    case 'function':
                        result[key] = handleObj.method.call(recipientObj);
                        break;
                    default:
                        throw new Meteor.Error(500, "For key=" + key + ": 'method' is " + typeof handleObj.method + " in handleObj should be function or string");
                        break;
                    }
                } else if ( isOneKey ) {
                    result[key] = result[key.substring(0, key.length - 3)] = oneFn.call(recipientObj);
                } else {
                    result[key] = manyFn.call(recipientObj);
                }
            });
            return result;
        }
    };
    Template.prototype.waitOn = function() {
        'use strict';
        var initializeData;
        if ( this.route != null) {
            //we are being called by the iron:router code
            initializeData = this.route.options.initializeData;
        } else {
            // template helper functions are on the template itself
            initializeData = this.initializeData;
        }
        if ( initializeData ) {
            var initialData;
            if ( typeof initializeData ==='function' ) {
                var router = Router.current(true);
                var params;
                if ( router && router.params) {
                    params = router.params;
                } else {
                    params = {};
                }
                initialData = initializeData(params);
            } else {
                initialData = initializeData;
            }
            var result = [];
            _.each(initialData, function(handleObj, key) {
                var handle;
                if ( handleObj ) {
                    if (handleObj && handleObj.handle) {
                        handle = handleObj.handle;
                    } else {
                        handle = handleObj;
                    }
                    if (handle && typeof handle.ready === 'function') {
                        result.push(handle);
                    }
                }
            });
            return result;
        }
    };

    // HACK : Need to put method some place else: different name space?
    // TODO: Be able to use RouteControllers
    Template.prototype._initializeRoutes = function() {
        'use strict';
        // HACK Meteor 0.9.4: to avoid warning messages because we have
        // Template.prototype.waitOn/data defined.
        Template.prototype._NOWARN_OLDSTYLE_HELPERS =true;
        // TODO: This does not work because no routes are defined at this moment
        // need to see if we can hook the route creation.
        _.each(Router.routes, function (route) {
            var templateName = route.options.template || route.router.convertTemplateName(route.name);
            var template = Template[templateName];
            // not all routes have templates...
            if (template) {
                _.each(['waitOn', 'data', 'initializeData'], function (action) {
                    // if a route does not have a function use the Template's function
                    // maybe in future merge Router.xx() and Template.xx() so that the results are
                    // combined?
                    if (typeof route.options[action] === 'undefined') {
                        console.log(route.name, " is getting a ", action);
                        route.options[action] = Blaze._getTemplateHelper(template, action);
                    } else {
                        console.log(route.name, " already has a ", action);
                    }
                });
            } else {
                console.log(route.name, " has no template");
            }
        });
        // HACK Meteor 0.9.4: to avoid warning messages because we have
        // Template.prototype.waitOn/data defined.
        delete Template.prototype._NOWARN_OLDSTYLE_HELPERS;
    }

    // Use these methods in initializeData
    one = function(handle) {
        return {
            handle: handle,
            method: oneFn
        };
    };
    // Use these methods in initializeData
    many = function(handle) {
        return {
            handle: handle,
            method: manyFn
        };
    };
}
