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
        createMeteorCallMethod : function(meteorCallDefinition, meteorCallNameSuffix) {
            var thatManager = this.thatManager;
            if ( meteorCallNameSuffix == null) {
                thatManager.fatal(
                    thatManager.toString(),
                    "'meteorCallNameSuffix' is null or undefined"
                );
            }
            var methods = {};
            var callName = this.getMeteorCallName(meteorCallNameSuffix);
            var methodFunction = meteorCallDefinition.method;
            var methodFunctionWithManager = function() {
                this.thatManager = thatManager;
                return methodFunction.apply(this, arguments);
            };
            if ( !_.isFunction(methodFunction)) {
                thatManager.fatal("No method supplied for ",callName);
            }

            var trackingEventKey = meteorCallDefinition.trackingEventKey;
            var permissionCheck = meteorCallDefinition.permissionCheck;

            // HACK : permission check needs to be made generic
            if (permissionCheck == null) {
                thatManager.warn(callName, ": Method has no permissionCheck defined");
                // throw new Meteor.Error(500, "Method has no permissionCheck defined for " + callName);
                methods[callName] = methodFunctionWithManager;
            } else if (_.contains(permissionCheck, 'public') || permissionCheck == 'public') {
                methods[callName] = methodFunctionWithManager;
            } else if ( typeof permissionCheck === 'function' ) {
                var permissionInfo = {
                    thatManager: thatManager,
                    method:callName
                };
                methods[callName] = function() {
                    var permissionCompleteInfo = _.extend({}, permissionInfo, {
                        userId: this.userId,
                        // copy the arguments so that permissionCheck can alter the arguments
                        args: _.toArray(arguments)
                    });
                    if (permissionCheck === 'public'
                      || (_.isFunction(permissionCheck) && permissionCheck(permissionCompleteInfo))){
                        return methodFunctionWithManager.apply(this, permissionCompleteInfo.args);
                    } else if ( _.isArray(permissionCheck)) {
                        for(var i =0 ; i < permissionCheck.length; i++) {
                            if ( !permissionCheck[i]
                              || !_.isFunction(permissionCheck[i])
                              || !permissionCheck[i](permissionCompleteInfo)) {
                                // failed permission check
                                debugger;
                                thatManager.log(403, "Current user not permitted to call " + callName);
                                return this.stop();
                            }
                        }
                        return methodFunctionWithManager.apply(this, permissionCompleteInfo.args);
                    } else {
                        debugger;
                        thatManager.log(403, "Current user not permitted to call " + callName);
                        throw new Meteor.Error(403, "Current user not permitted to call " + callName);
                    }
                };
            } else {
                thatManager.fatal(
                    thatManager.toString()+ "."+ meteorCallNameSuffix,
                    "has a permission check ("+permissionCheck+")",
                    "that is not a function or the string 'public'"
                );
            }
            // Now do the Meteor.method definition
            Meteor.methods(methods);
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
            var thatManager = this.thatManager;
            var meteorTopicName = this.getMeteorTopicName(meteorTopicSuffix);
            var meteorTopicTableName = thatManager.getMeteorTopicTableName(meteorTopicSuffix);
//            var meteorTopicCursorFunction = thatManager.getMeteorTopicCursorFunction(meteorTopicSuffix);
            var meteorTopicCursorFunction = meteorTopicDefinition.cursor;
            if ( !_.isFunction(meteorTopicCursorFunction)) {
                thatManager.fatal("No cursor function supplied for "+meteorTopicName);
            }
            // make the current manager available on cursor when doing publish subscribe.
            Object.defineProperties(meteorTopicCursorFunction, {
                thatManager: {
                    writable: false,
                    enumerable:false,
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
                addedObject: {
                    writable: false,
                    value: function(id, fields) {
                        return this.added(meteorTopicTableName, id, fields);
                    }
                },
                removeObject: {
                    writable: false,
                    value: function(id) {
                        return this.remove(meteorTopicTableName, id);
                    }
                },
                changedObject: {
                    writable: false,
                    value: function(id, fields) {
                        return this.changed(meteorTopicTableName, id, fields);
                    }
                }
            });

            var securedCursorFunction;
            var permissionCheck = meteorTopicDefinition.permissionCheck;
            if (permissionCheck == null ) {
                thatManager.warn("Topic ", meteorTopicName, ' has no permissionCheck');
                securedCursorFunction = meteorTopicCursorFunction;
            } else if(_.contains(permissionCheck, 'public') || permissionCheck == 'public') {
                securedCursorFunction = meteorTopicCursorFunction;
            } else {
                var permissionInfo = {
                    thatManager: thatManager,
                    topic:meteorTopicName
                };
                securedCursorFunction = function () {
                    var permissionCompleteInfo = _.extend({}, permissionInfo, {
                        userId: this.userId,
                        // copy the arguments so that permissionCheck can alter the arguments
                        args: _.toArray(arguments)
                    });
                    if (permissionCheck === 'public'
                        || (_.isFunction(permissionCheck) && permissionCheck(permissionCompleteInfo))){
                        return meteorTopicCursorFunction.apply(this, permissionCompleteInfo.args);
                    } else if ( _.isArray(permissionCheck)) {
                        for(var i =0 ; i < permissionCheck.length; i++) {
                            if ( !permissionCheck[i]
                              || !_.isFunction(permissionCheck[i])
                              || !permissionCheck[i](permissionCompleteInfo)) {
                                // failed permission check
                                debugger;
                                thatManager.log(
                                    403,
                                    meteorTopicName+":Current user not permitted to subscribe"
                                );
                                return this.stop();
                            }
                        }
                        return meteorTopicCursorFunction.apply(this, permissionCompleteInfo.args);
                    } else {
                        debugger;
                        thatManager.log(
                            403,
                            meteorTopicName+":Current user not permitted to subscribe"
                        );
                        return this.stop();
                    }
                };
            }

            // insure that this.ready() is called when the no data is returned. (required for
            // spiderable to work)
            var wrappedFn = function() {
                Object.defineProperties(this, {
                    // Question: this should be o.k. because we don't have the cursor (this)
                    // reused. (not certain that the topic cursor is not reused)
                    meteorTopicCursorFunction: {
                        enumerable: false,
                        writable: false,
                        value: meteorTopicCursorFunction
                    },
                    // so that this.thatManager always return the thatManager on both the client and
                    // the server.
                    thatManager: {
                        enumerable: false,
                        writable: false,
                        value: thatManager
                    },
                    addedObject: {
                        enumerable: false,
                        writable: false,
                        value: meteorTopicCursorFunction.addedObject
                    },
                    removeObject: {
                        enumerable: false,
                        writable: false,
                        value: meteorTopicCursorFunction.removeObject
                    },
                    changedObject: {
                        enumerable: false,
                        writable: false,
                        value: meteorTopicCursorFunction.changedObject
                    }
                });
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
            /**
             * IMPORTANT TODO: allow for the publication to be configured with different method
             * i.e.
             * 'publishComposite' so that https://atmospherejs.com/reywood/publish-composite
             * could be used.
             * or
             * 'publishCache' so that https://atmospherejs.com/bozhao/publish-cache
             * could be used.
             * or
             * 'reactivePublish' so that : https://github.com/Diggsey/meteor-reactive-publish
             * could be used.
             */
            Meteor.publish(meteorTopicName, wrappedFn);
            thatManager._defineFindFunctionsForTopic(meteorTopicSuffix, meteorTopicCursorFunction);
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
         * code. (see docs.meteor.com about this.userId in publish/subscribe functions )
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
