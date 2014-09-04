// TODO: put in a pull request to iron-router
// this works but can we use a global hook that for a given route does a universal lookup.
if ( Router != null) {
    Template.prototype.data = function() {
        var initializeData = this.route.options.initializeData;
        if ( initializeData ) {
            var initialData;
            if ( typeof initializeData ==='function' ) {
                var params = getRouterParams();
                initialData = initializeData(params);
            } else {
                initialData = initializeData;
            }
            var result = {};
            _.each(initialData, function(handle, key) {
                var resultKey;
                var resultFnName;
                if ( key.length > 3 && key.substring(key.length-3,key.length) === 'One') {
                    resultKey = key.substring(0, key.length - 3);
                    resultFnName = 'findOne';
                } else {
                    resultKey = key;
                    resultFnName = 'findFetch';
                }
                if ( handle == null) {
                    result[resultKey] = handle;
                } else if ( typeof handle[resultFnName] ==='function') {
                    result[ resultKey ] = handle[resultFnName]();
                } else {
                    // straight data - not from a cursor
                    result[ resultKey ] = handle[resultFnName];
                }
            });
            return result;
        }
    }
    Template.prototype.waitOn = function() {
        var initializeData = this.route.options.initializeData;
        if ( initializeData ) {
            var initialData;
            if ( typeof initializeData ==='function' ) {
                var params = getRouterParams();
                initialData = initializeData(params);
            } else {
                initialData = initializeData;
            }
            var result = [];
            _.each(initialData, function(handle, key) {
                if ( handle && typeof handle.ready === 'function') {
                    result.push(handle);
                }
            });
            return result;
        }
    }
    // if a route does not have a waitOn function borrow from the Template's waitOn.
    _.each(Router.routes, function (route) {
        var templateName = route.router.convertTemplateName(route.name);
        var template = Template[templateName];
        // not all routes have templates...
        if ( template ) {
            _.each(['waitOn', 'data', 'initializeData'], function (action) {
                if (typeof route.options[action] === 'undefined') {
                    route.options[action] = template[action];
                }
            });
        }
    });
}
