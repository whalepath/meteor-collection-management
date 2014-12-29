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
    // Use these methods in initializeData
    one = function one(handle) {
        return {
            handle: handle,
            method: oneFn
        };
    };
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
    // Use these methods in initializeData
    many = function many(handle) {
        return {
            handle: handle,
            method: manyFn
        };
    };
    count = function count(handle) {
        return {
            handle: handle,
            method: function() {
                var oneResult = oneFn.apply(this, arguments);
                if ( oneResult != null) {
                    return oneResult.count;
                } else {
                    return void(0);
                }
            }
        };
    };

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
    var DefaultIronRouterFunctions = {
        data: function DefaultIronRouterFunctions_Data() {
            'use strict';
            var initializeData;
            // TO_PAT(2014-11-14): what does this alternative mean? In most cases, we have helper
            // functions on the tmpl itself, but we take the first path.
            if (this.route != null) {
                //we are being called by the iron:router code
                initializeData = this.route.options.initializeData;
            }
            if ( initializeData == null) {
                // template helper functions are on the template itself
                initializeData = this.initializeData;
            }

            if (initializeData) {
                var initialData;
                if (typeof initializeData === 'function') {
                    var router = Router.current(true);
                    var params;
                    if (router && router.params) {
                        params = router.params;
                    } else {
                        params = {};
                    }
                    initialData = initializeData(params);
                } else {
                    initialData = initializeData;
                }

                var result = {};
                _.each(initialData, function (handleObj, key) {
                    var isHandleAndMethod;
                    try {
                        isHandleAndMethod = handleObj != null
                        && 'handle' in handleObj
                        && 'method' in handleObj;
                    } catch (e) {
                        // string or something else
                        isHandleAndMethod = false;
                    }
                    var recipientObj = isHandleAndMethod ? handleObj.handle : handleObj;
                    var isOneKey = key.length > 3 && key.substring(key.length - 3, key.length) == 'One';
                    if (recipientObj == null) {
                        // null or undefined handleObj or handle.handleObj is null or undefined
                        result[key] = recipientObj;
                        if (isOneKey) {
                            result[key.substring(0, key.length - 3)] = recipientObj;
                        }
                    } else if (isHandleAndMethod) {
                        switch (typeof handleObj.method) {
                        case 'undefined':
                            throw new Meteor.Error(500, "For key=", key, ": ",
                                "'method' is undefined in handleObj"
                            );
                            break;
                        case 'string':
                            if (typeof recipientObj[handleObj.method] === 'function') {
                                result[key] = recipientObj[handleObj.method]();
                            } else {
                                throw new Meteor.Error(500, "For key=", key, ": ",
                                    "'method'=" + handleObj.method + " is not a function on recipientObj"
                                );
                            }
                            break;
                        case 'function':
                            result[key] = handleObj.method.call(recipientObj);
                            break;
                        default:
                            throw new Meteor.Error(500, "For key=", key, ": ",
                                "'method' is", typeof handleObj.method, "in handleObj",
                                "should be function or string"
                            );
                            break;
                        }
                    } else if (isOneKey) {
                        result[key] = result[key.substring(0, key.length - 3)] = oneFn.call(recipientObj);
                    } else {
                        result[key] = manyFn.call(recipientObj);
                    }
                });
                debugger;
                return result;
            }
        },
        //waitOn: function DefaultIronRouterFunctions_WaitOn() {
        //    'use strict';
        //    var result = [];
        //    var initializeData;
        //    if (this.route != null) {
        //        //we are being called by the iron:router code
        //        initializeData = this.route.options.initializeData;
        //    }
        //    if ( initializeData == null) {
        //        // template helper functions are on the template itself
        //        initializeData = this.initializeData;
        //    }
        //    if (initializeData) {
        //        var initialData;
        //        if (typeof initializeData === 'function') {
        //            var router = Router.current(true);
        //            var params;
        //            if (router && router.params) {
        //                params = router.params;
        //            } else {
        //                params = {};
        //            }
        //            initialData = initializeData(params);
        //        } else {
        //            initialData = initializeData;
        //        }
        //
        //        _.each(initialData, function (handleObj, key) {
        //            var handle;
        //            if (handleObj) {
        //                if (handleObj && handleObj.handle) {
        //                    handle = handleObj.handle;
        //                } else {
        //                    handle = handleObj;
        //                }
        //                if (handle && typeof handle.ready === 'function') {
        //                    result.push(handle);
        //                }
        //            }
        //        });
        //    }
        //    debugger;
        //    return result;
        //}
    };
    _.extend(Template.prototype, DefaultIronRouterFunctions);

    // HACK : Need to put method some place else: different name space?
    // TODO: Be able to use RouteControllers
    Template.prototype._initializeRoutes = function _initializeRoutes() {
        'use strict';
        // HACK Meteor 0.9.4: to avoid warning messages because we have
        // Template.prototype.waitOn/data defined.
        Template.prototype._NOWARN_OLDSTYLE_HELPERS =true;
        // TODO: This does not work because no routes are defined at this moment
        // need to see if we can hook the route creation.
        _.each(Router.routes, function (route) {
            var routeName = route.getName? route.getName(): route.name;
            var templateName = route.options.template || (route.router.toTemplateName?route.router.toTemplateName(routeName):route.router.convertTemplateName(routeName));
            var template = Template[templateName];
            var initializeData = route.options.initializeData;
            if (initializeData == null && template ) {
                initializeData = Blaze._getTemplateHelper(template, 'initializeData');
            }
            // not all routes have templates...
            _.each(['initializeData', 'waitOn', 'data'], function (action) {
                var templateAction;
                if ( template ) {
                    templateAction = Blaze._getTemplateHelper(template, action);
                }
                if ( templateAction == null && initializeData && action != 'initializeData') {
                    templateAction = DefaultIronRouterFunctions[action];
                }
                // if a route does not have a function use the Template's function
                // maybe in future merge Router.xx() and Template.xx() so that the results are
                // combined?
                if (route.options[action] != null && templateAction !=null) {
                    console.log(routeName, ": route already has a ", action);
                    console.log(routeName, "making combined", action);
                    var routeAction = route.options[action];
                    var combinedAction;
                    switch(action) {
                    case 'waitOn':
                        if (_.isArray(routeAction)) {
                            combinedAction = routeAction.concat([templateAction]);
                        } else if (_.isFunction(routeAction)) {
                            combinedAction = [routeAction, templateAction];
                        } else {
                            throw new Error(routeName, 'waitOn not fn or array');
                        }
                        route.options[action] = combinedAction;
                        break;
                    case 'data':
                        combinedAction = function combinedAction() {
                            var results = {};
                            _.extend(results, templateAction.apply(this, arguments));
                            _.extend(results, routeAction.apply(this, arguments));
                            return results;
                        };
                        route.options[action] = combinedAction;
                        break;
                    }

                } else if ( templateAction !=null) {
                    route.options[action] = templateAction;
                    console.log(routeName, " is getting a ", action, " and set ", route.options[action] != null);
                }
            });
        });
        // HACK Meteor 0.9.4: to avoid warning messages because we have
        // Template.prototype.waitOn/data defined.
        delete Template.prototype._NOWARN_OLDSTYLE_HELPERS;
    };
}
