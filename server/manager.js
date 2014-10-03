Meteor.startup(function() {
    'use strict';
    _.extend(ManagerType.prototype, {
        /**
         * create the Meteor.method hook:
         * Meteor.method({ <managers_prefix>+meteorCallDefinition : generated meteor function that
         * will invoke the manager stubName function with this set to the manager instance );
         *
         * @param meteorCallDefinitionParam could be an empty object if the meteor call was just
         * specified with a string
         * @param meteorCallNameSuffix : the name of the Meteor method. To make the meteor method
         * name globally unique, the Manager.callPrefix is prepended
         */
        createMeteorCallMethod : function(meteorCallDefinitionParam, meteorCallNameSuffix) {
            var thatManager = this;
            if ( meteorCallNameSuffix == null) {
                throw new Meteor.Error(500, thatManager.toString() +" 'meteorCallNameSuffix' is null or undefined");
            }
            var methods = {};
            var callName = this.getMeteorCallName(meteorCallNameSuffix);
            var meteorCallDefinition;
            var methodFunction;
            // make sure that the subclass manager is bound as the 'this' parameter when the Meteor
            // method is called.
            if ( thatManager[meteorCallNameSuffix] == null || typeof thatManager[meteorCallNameSuffix] === 'object' ) {
                // additional method definitions is separate from the array of client
                meteorCallDefinition = _.extend({}, meteorCallDefinitionParam, thatManager[meteorCallNameSuffix]);
                // the method function can be supplied in the definition : { method:<function> } or
                // {method: 'methodName' } or not at all in which case it will default to
                var methodFunctionObj = meteorCallDefinition.fn;
                if ( methodFunctionObj == null ) {
                    var methodFunctionObj = meteorCallNameSuffix+'Method';
                    if ( typeof thatManager[methodFunctionObj] !== 'function' ) {
                        throw new Meteor.Error(500, callName+ ": no '.method' in Meteor.method definition and default Meteor.method '"+methodFunctionObj+"' is not present.");
                    } else {
                        methodFunction = thatManager[methodFunctionObj];
                    }
                } else if ( typeof methodFunctionObj === 'string') {
                    if ( typeof thatManager[methodFunctionObj] !== 'function' ) {
                        throw new Meteor.Error(500, callName+ ": '.method' in Meteor.method definition '"+methodFunctionObj+"' is not present.");
                    } else {
                        methodFunction = thatManager[methodFunctionObj];
                    }
                } else if (typeof methodFunctionObj === 'function'){
                    methodFunction = methodFunctionObj;
                } else {
                    // TODO: display better
                    throw new Meteor.Error(500, thatManager.toString() +"."+meteorCallNameSuffix+".method is not a function");
                }
            } else if ( typeof(thatManager[meteorCallNameSuffix]) === "function") {
                // old way of doing things.
                methodFunction = thatManager[meteorCallNameSuffix];
                meteorCallDefinition = _.extend({}, meteorCallDefinitionParam, _.pick(thatManager[meteorCallNameSuffix], 'permissionCheck'));
            } else {
                // TODO: display better
                throw new Meteor.Error(500, thatManager.toString() +"."+meteorCallNameSuffix+" is not a function or an object");
            }
            var trackingEventKey = meteorCallDefinition.trackingEventKey;
            var permissionCheck = meteorCallDefinition.permissionCheck;
            // bind to thatManager so that the function handling the Meteor.call() has a (very)
            // useful 'this'
            var meteorMethodFunctionBoundToManager = methodFunction.bind(thatManager);
            if (permissionCheck == null) {
                thatManager.log("warning: Method has no permissionCheck defined for " + callName);
//                throw new Meteor.Error(500, "Method has no permissionCheck defined for " + callName);
                methods[callName] = meteorMethodFunctionBoundToManager;
            } else if (_.contains(permissionCheck, 'public') || permissionCheck == 'public') {
                methods[callName] = meteorMethodFunctionBoundToManager;
            } else if ( typeof permissionCheck === 'function' ) {
                methods[callName] = function() {
                    if (permissionCheck(this.userId)) {
                        return meteorMethodFunctionBoundToManager.apply(arguments);
                    } else {
                        debugger;
                        thatManager.log(403, "Current user not permitted to call " + callName);
                        throw new Meteor.Error(403, "Current user not permitted to call " + callName);
                    }
                };
            } else if ( Roles ) {
                // HACK for Daniel and his stock price! - this elseif will be removed!
                methods[callName] = function() {
                    if (Roles.userIsInRole(this.userId, permissionCheck)) {
                        return meteorMethodFunctionBoundToManager.apply(thatManager, arguments);
                    } else {
                        debugger;
                        thatManager.log(403, "Current user not permitted to call " + callName);
                        throw new Meteor.Error(403, "Current user not permitted to call " + callName);
                    }
                };
            } else {
                throw new Meteor.Error(500, thatManager.toString()+ "."+ meteorCallNameSuffix+ " has a permission check ("+permissionCheck+") that is not a function or the string 'public'" );
            }
            // Now do the Meteor.method definition
            Meteor.methods(methods);
        },
        _wrapCursorWithPermittedRoles: function(cursor, permissionCheck, topicName) {
            var that = this;
            if ( Roles ) {
                var wrappedCursor = function () {
                    if (Roles.userIsInRole(this.userId, permissionCheck)) {
                        return cursor.apply(that, arguments);
                    } else {
                        debugger;
                        thatManager.log(403, topicName+":Current user not permitted to subscribe");
                        return this.stop();
                    }
                };
                return wrappedCursor;
            } else {
                return cursor;
            }
        },
        /**
         * Creates a Meteor topic with Meteor.publish()
         *
         * Topic is named manager's callPrefix+'_topic_'+meteorTopicSuffix ( see
         * this.getMeteorTopicName() )

         * Meteor.publish/subscribe has a useful 'this': access the meteorTopic name, meteorTopic
         * cursor function, and thatManager in the cursor function:
         *   this.meteorTopicCursorFunction.thatManager - the manager that created this meteorTopic
         *   this.meteorTopicCursorFunction.meteorTopicName - the full meteorTopic name
         *   this.meteorTopicCursorFunction.meteorTopicSuffix - the full meteorTopic name
         *   this.meteorTopicCursorFunction.meteorTopicTableName
         *
         * This function is called from the ManagerType constructor.
         *
         * Also create for server side use:
         *    meteorTopicSuffix = to fetch all
         *    meteorTopicSuffixOne = to fetch one
         * @param meteorTopicSuffix
         */
        createTopic : function(meteorTopicDefinition, meteorTopicSuffix) {
            var thatManager = this;
            var meteorTopicName = this.getMeteorTopicName(meteorTopicSuffix);
            var meteorTopicTableName = thatManager.getMeteorTopicTableName(meteorTopicSuffix);
            var meteorTopicCursorFunction = thatManager.getMeteorTopicCursorFunction(meteorTopicSuffix);
            // make the current manager available on cursor when doing publish subscribe.
            Object.defineProperties(meteorTopicCursorFunction, {
                thatManager: {
                    writable: false,
                    value: thatManager
                },
                meteorTopicName: {
                    writable: false,
                    value: meteorTopicName
                },
                meteorTopicSuffix : {
                    writable: false,
                    value: meteorTopicSuffix
                },
                meteorTopicTableName: {
                    writable: false,
                    value: meteorTopicTableName
                },
            });

            var securedCursorFunction;
            if (meteorTopicCursorFunction.permissionCheck) {
                if(_.include(meteorTopicCursorFunction.permissionCheck, 'public')
                   || meteorTopicCursorFunction.permissionCheck == 'public') {
                    thatManager.log(meteorTopicName, 'is public');
                    securedCursorFunction = meteorTopicCursorFunction;
                } else {
                    thatManager.log(meteorTopicName, 'is secured');
                    securedCursorFunction = this._wrapCursorWithPermittedRoles(
                        meteorTopicCursorFunction,
                        meteorTopicCursorFunction.permissionCheck,
                        meteorTopicName
                    );
                }
            } else {
                thatManager.log("Topic ", meteorTopicName, ' has no permissionCheck');
                securedCursorFunction = meteorTopicCursorFunction;
            }

            // insure that this.ready() is called when the no data is returned. (required for
            // spiderable to work)
            var wrappedFn = function() {
                // Question: this should be o.k. because we don't have the cursor (this)
                // reused. (not certain that the topic cursor is not reused)
                this.meteorTopicCursorFunction = meteorTopicCursorFunction;
                // so that this.thatManager always return the thatManager on both the client and the
                // server.
                this.thatManager = thatManager;
                var returnedValue = securedCursorFunction.apply(this, arguments);
                if ( returnedValue == null || returnedValue === false) {
                    // required for spiderable to work
                    // see: http://www.meteorpedia.com/read/spiderable
                    returnedValue = void(0);
                    this.ready();
                } else if ( returnedValue === true ) {
                    // true means we would like to return null *but* the ready method was already
                    // called
                    returnedValue = void(0);
                }
                return returnedValue;
            };
            Meteor.publish(meteorTopicName, wrappedFn);
            thatManager._defineFindFunctionsForTopic(meteorTopicSuffix);
        },
        redirect: function(url, router) {
            router.response.statusCode = 302;
            if ( url == null ) {
                url = Meteor.absoluteUrl();
            }
            // TODO: alter window history so that a 'go back' goes to the previous whalepath page (
            // not this redirect page )
            //
            // TODO: except if the previous page is a non-whalepath page.
            router.response.setHeader('Location', url);
        }
    });
    Object.defineProperties(ManagerType.prototype, {
        /**
         * This is a property so that code in a cursor can look like code elsewhere in the manager
         * code. (see doc.Meteor.com about this.userId in publish/subscribe functions )
         */
        userId : {
            get : function() {
                // 26 mar 2014 mimics the meteor check in Meteor.userId() to avoid exception being
                // thrown
                var currentInvocation = DDP._CurrentInvocation.get();
                if ( currentInvocation) {
                    return Meteor.userId();
                } else {
                    // return undefined so we can tell difference between "no logged on user" and
                    // "we don't know"
                    return void(0);
                }
            }
        }
    });
});
