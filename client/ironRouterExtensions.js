// TODO: put in a pull request to iron-router
// this works but can we use a global hook that for a given route does a universal lookup.
if ( Router != null) {
    /**
     * A standard data() that will be called by the Router code to get the template's data.
     * This function will be used by the Router code.
     *
     * @returns {{}}
     */
    Template.prototype.data = function() {
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
                var params = getRouterParams();
                initialData = initializeData(params);
            } else {
                initialData = initializeData;
            }
            var result = {};
            _.each(initialData, function(handleObj, key) {
                var isHandleAndMethod = 'handle' in handleObj && 'method' in handleObj;
                var recipientObj = isHandleAndMethod? handleObj.handle : handleObj;
                if ( recipientObj == null ) {
                    // null or undefined handleObj or handle.handleObj is null or undefined
                    result[key] = recipientObj;
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
                        throw new Meteor(500, "For key=" + key + ": 'method' is " + typeof handleObj.method + " in handleObj");
                        break;
                    }
                } else if ( key.length > 3 && key.substring(key.length-3, key.length) == 'One' && typeof recipientObj.findOne === 'function') {
                    result[key] = result[key.substring(0, key.length - 3)] = recipientObj.findOne();
                } else if(typeof recipientObj.findFetch === 'function') {
                    result[key] = recipientObj.findFetch();
                } else {
                    // handleObj is just data
                    result[key] = handleObj;
                }
            });
            return result;
        }
    };
    Template.prototype.waitOn = function() {
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
                var params = getRouterParams();
                initialData = initializeData(params);
            } else {
                initialData = initializeData;
            }
            var result = [];
            _.each(initialData, function(handleObj, key) {
                var handle;
                if(handleObj.handle) {
                    handle = handleObj.handle;
                } else {
                    handle = handleObj;
                }
                if ( handle && typeof handle.ready === 'function') {
                    result.push(handle);
                }
            });
            return result;
        }
    };

    // HACK : Need to put method some place else: different name space?
    Template.prototype._initializeRoutes = function() {
        // TODO: This does not work because no routes are defined at this moment
        // need to see if we can hook the route creation.
        _.each(Router.routes, function (route) {
            var templateName = route.router.convertTemplateName(route.name);
            var template = Template[templateName];
            // not all routes have templates...
            if (template) {
                _.each(['waitOn', 'data', 'initializeData'], function (action) {
                    // if a route does not have a function use the Template's function
                    // maybe in future merge Router.xx() and Template.xx() so that the results are
                    // combined?
                    if (typeof route.options[action] === 'undefined') {
                        route.options[action] = template[action];
                    }
                });
            }
        });
    }

    // Use these methods in initializeData
    one = function(handle) {
        return {
            handle: handle,
            method: 'findOne'
        };
    };
    // Use these methods in initializeData
    many = function(handle) {
        return {
            handle: handle,
            method: 'findFetch'
        };
    };
}
