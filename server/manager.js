var publishTypes = {
    cache: 'publishCache',
    default: 'publish'
};

Meteor.startup(function() {
    'use strict';
    Object.defineProperties(ManagerType.prototype, {
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
        createMeteorCallMethod: {
            value: function (meteorCallDefinition, meteorCallNameSuffix) {
                var thatManager = this.thatManager;
                if (meteorCallNameSuffix == null) {
                    thatManager.fatal(
                        "'meteorCallNameSuffix' is null or undefined"
                    );
                }
                var methods = {};
                var callName = this.getMeteorCallName(meteorCallNameSuffix);
                var methodFunction = meteorCallDefinition.method;
                var methodFunctionWithManager = function () {
                    this.thatManager = thatManager;
                    return methodFunction.apply(this, arguments);
                };
                if (!_.isFunction(methodFunction)) {
                    thatManager.fatal("No method supplied for ", callName, "." +
                    "File loading in meteor requires that managers be in server/lib/managers");
                }

                var permissionCheck = meteorCallDefinition.permissionCheck;

                // HACK : permission check needs to be made generic
                if (permissionCheck == null) {
                    thatManager.warn(callName, ": Method has no permissionCheck defined");
                    // throw new Meteor.Error(500, "Method has no permissionCheck defined for " + callName);
                    methods[callName] = methodFunctionWithManager;
                } else if (_.contains(permissionCheck, 'public') || permissionCheck == 'public') {
                    methods[callName] = methodFunctionWithManager;
                } else if (typeof permissionCheck === 'function') {
                    var permissionInfo = {
                        thatManager: thatManager,
                        meteorMethodName: callName
                    };
                    methods[callName] = function () {
                        var permissionCompleteInfo = _.extend({}, permissionInfo, {
                            userId: this.userId,
                            // copy the arguments so that permissionCheck can alter the arguments
                            args: _.toArray(arguments)
                        });
                        if (permissionCheck === 'public'
                            || (_.isFunction(permissionCheck) && permissionCheck(permissionCompleteInfo))) {
                            return methodFunctionWithManager.apply(this, permissionCompleteInfo.args);
                        } else if (_.isArray(permissionCheck)) {
                            for (var i = 0; i < permissionCheck.length; i++) {
                                if (!permissionCheck[i]
                                    || !_.isFunction(permissionCheck[i])
                                    || !permissionCheck[i](permissionCompleteInfo)) {
                                    // failed permission check
                                    thatManager.log(403, "Current user not permitted to call", callName);
                                    throw new Meteor.Error(403,
                                        "Current user not permitted to call", callName
                                    );
                                }
                            }
                            return methodFunctionWithManager.apply(this, permissionCompleteInfo.args);
                        } else {
                            thatManager.log(403, "Current user not permitted to call " + callName);
                            throw new Meteor.Error(403, "Current user not permitted to call " + callName);
                        }
                    };
                } else {
                    thatManager.fatal(
                        thatManager.toString() + "." + meteorCallNameSuffix,
                        "has a permission check (" + permissionCheck + ")",
                        "that is not a function or the string 'public'"
                    );
                }
                // Now do the Meteor.method definition
                Meteor.methods(methods);
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
        createPublication: {
            value: function (meteorTopicDefinition) {
                var thatManager = this.thatManager;
                var fullMeteorTopicDefinition = thatManager.getFullMeteorTopicDefinition(meteorTopicDefinition);
                var meteorTopicSuffix = fullMeteorTopicDefinition.meteorTopicSuffix;
                var meteorTopicName = fullMeteorTopicDefinition.meteorTopicName;
                var meteorTopicTableName = thatManager.getMeteorTopicTableName(meteorTopicSuffix);
                var meteorTopicCursorFunction = fullMeteorTopicDefinition.cursor;
                if (!_.isFunction(meteorTopicCursorFunction)) {
                    thatManager.fatal("No cursor function supplied for " + meteorTopicName);
                }
                // TODO: idea to handle multiple cursors returned. fullMeteorTopicDefinition.cursor is the
                // primary cursor fullMeteorTopicDefinition.query is the function called that calls
                // fullMeteorTopicDefinition.cursor and adds in additional cursors to the publication.
                //
                //var meteorTopicQueryFunction = fullMeteorTopicDefinition.query | meteorTopicCursorFunction;
                // make the current manager available on cursor when doing publish subscribe.
                var meteorTopicCursorFunctionProperties = {
                    thatManager: {
                        writable: false,
                        enumerable: false,
                        configurable: false,
                        value: thatManager
                    },
                    meteorTopicDefinition: {
                        writable: false,
                        enumerable: false,
                        configurable: false,
                        value: fullMeteorTopicDefinition
                    },
                    meteorTopicName: {
                        writable: false,
                        enumerable: false,
                        configurable: false,
                        value: meteorTopicName
                    },
                    meteorTopicSuffix: {
                        writable: false,
                        enumerable: false,
                        configurable: false,
                        value: meteorTopicSuffix
                    },
                    meteorTopicTableName: {
                        writable: false,
                        enumerable: false,
                        configurable: false,
                        value: meteorTopicTableName
                    },
                    addedObject: {
                        writable: false,
                        enumerable: false,
                        value: function (id, fields) {
                            return this.added(meteorTopicTableName, id, fields);
                        }
                    },
                    /**
                     *  Useful for single instance subscriptions.  id is <meteorTopicTableName> ( so
                     *  only 1 object can ever be in this subscription )
                     */
                    addedSingletonObject: {
                        writable: false,
                        enumerable: false,
                        value: function (fields) {
                            var value = this.addedObject(meteorTopicTableName, fields);
                            return value;
                        }
                    },
                    /**
                     * addedObjectAndReady: add object (with custom id) and mark ready.
                     * multiple objects may reside in the subscription but only 1 at a time is added.
                     */
                    addedObjectAndReady: {
                        writable: false,
                        enumerable: false,
                        value: function (id, fields) {
                            var value = this.added(meteorTopicTableName, id, fields);
                            this.ready();
                            return value;
                        }
                    },
                    removeObject: {
                        writable: false,
                        enumerable: false,
                        value: function (id) {
                            return this.remove(meteorTopicTableName, id);
                        }
                    },
                    changedObject: {
                        writable: false,
                        value: function (id, fields) {
                            return this.changed(meteorTopicTableName, id, fields);
                        }
                    }
                };
                Object.defineProperties(meteorTopicCursorFunction, meteorTopicCursorFunctionProperties);

                var securedCursorFunction;
                var permissionCheck = fullMeteorTopicDefinition.permissionCheck;
                if (permissionCheck == null) {
                    thatManager.warn("Publication ", meteorTopicName, ' has no permissionCheck');
                    securedCursorFunction = meteorTopicCursorFunction;
                } else if (_.contains(permissionCheck, 'public') || permissionCheck == 'public') {
                    securedCursorFunction = meteorTopicCursorFunction;
                } else {
                    var permissionInfo = {
                        thatManager: thatManager,
                        meteorTopicName: meteorTopicName
                    };
                    securedCursorFunction = function () {
                        var self = this;
                        var permissionCompleteInfo = _.extend({}, permissionInfo, {
                            userId: this.userId,
                            // copy the arguments so that permissionCheck can alter the arguments
                            args: _.toArray(arguments)
                        });
                        if (permissionCheck === 'public'
                            || (_.isFunction(permissionCheck) && permissionCheck(permissionCompleteInfo))) {
                            return meteorTopicCursorFunction.apply(this, permissionCompleteInfo.args);
                        } else if (_.isArray(permissionCheck)) {
                            for (var i = 0; i < permissionCheck.length; i++) {
                                if (!permissionCheck[i]
                                    || !_.isFunction(permissionCheck[i])
                                    || !permissionCheck[i](permissionCompleteInfo)) {
                                    // failed permission check
                                    return new Meteor.Error(
                                        "403",
                                        meteorTopicName + ":Current user not permitted to subscribe.",
                                        "userId=" + self.userId
                                    );
                                }
                            }
                            return meteorTopicCursorFunction.apply(this, permissionCompleteInfo.args);
                        } else {
                            return new Meteor.Error(
                                "403",
                                meteorTopicName + ":Current user not permitted to subscribe.",
                                "userId=" + self.userId
                            );
                        }
                    };
                }

                var wrappedFn = thatManager._createMeteorHandleAugmentationFunction(
                    securedCursorFunction,
                    meteorTopicCursorFunctionProperties,
                    meteorTopicCursorFunction
                );

                /**
                 * IMPORTANT TODO: allow for the publication to be configured with different method
                 * i.e.
                 * 'publishComposite' so that https://atmospherejs.com/reywood/publish-composite /
                 * https://github.com/englue/meteor-publish-composite.git
                 * could be used.
                 * or
                 * 'reactivePublish' so that : https://github.com/Diggsey/meteor-reactive-publish.git
                 * could be used.
                 */
                var publishMethod = publishTypes[fullMeteorTopicDefinition.publishMethod] || 'publish';
                Meteor[publishMethod](meteorTopicName, wrappedFn);
                thatManager._defineFindFunctionsForSubscription(
                    meteorTopicSuffix,
                    meteorTopicCursorFunction
                );
                thatManager._processDerivedCursors(fullMeteorTopicDefinition, function (fullDerivedDefinition) {
                    var wrappedFunction = fullDerivedDefinition.cursor;
                    if (wrappedFunction == null) {
                        if (fullDerivedDefinition.extensionName === 'count') {
                            wrappedFunction = function (options) {
                                var thatManager = this.thatManager;
                                var meteorTopicDefinition = options.meteorTopicDefinition;
                                var parentCursor = meteorTopicDefinition.parentMeteorTopicDefinition.cursor;
                                // Note: yes we could use closure here but we want to make sure that if we
                                // get a user defined function that it has all the need variables.
                                var cursor = meteorTopicCursorFunction.apply(this, options.arguments);
                                var meteorTopicName = meteorTopicDefinition.meteorTopicName;
                                var meteorTopicTableName = meteorTopicDefinition.meteorTopicTableName;
                                var derivedMeteorTopicSuffix = meteorTopicDefinition.meteorTopicSuffix;
                                // TODO: create a hash with arguments to add to id string.
                                var id = meteorTopicName;
                                var countValue;

                                if (cursor == null) {
                                    // cursor() returned a undefined/null.
                                    // this can happen if the client hasn't yet logged in for example
                                    // so this is not really an error.
                                    countValue = void(0);
                                } else {
                                    countValue = cursor.count();
                                }
                                this.addedObject(id, {count: countValue});
                            };
                        } else {
                            thatManager.error(
                                "Only know how to handle derived 'count' not",
                                fullDerivedDefinition.extensionName,
                                "in",
                                fullDerivedDefinition.meteorTopicSuffix
                            );
                            debugger;
                        }
                    }
                    return wrappedFunction;
                });
            }
        },
        _createMeteorHandleAugmentationFunction: {
            value: function (securedCursorFunction,
                             meteorTopicCursorFunctionProperties,
                             meteorTopicCursorFunction) {
                // TODO: PATM: why can't we just pass securedCursorFunction?
                var thatManager = this.thatManager;
                // insure that this.ready() is called when the no data is returned. (required for
                // spiderable to work)
                var wrappedFn = function () {
                    var self = this;
                    Object.defineProperties(this, {
                        // Question: this should be o.k. because we don't have the cursor (this)
                        // reused. (not certain that the topic cursor is not reused)
                        meteorTopicCursorFunction: {
                            enumerable: false,
                            writable: false,
                            value: meteorTopicCursorFunction
                        }
                    });
                    Object.defineProperties(this, meteorTopicCursorFunctionProperties);

                    var returnedValue = securedCursorFunction.apply(this, arguments);
                    if (returnedValue == null || returnedValue === false) {
                        // required for spiderable to work
                        // see: http://www.meteorpedia.com/read/spiderable
                        returnedValue = void(0);
                        this.ready();
                    } else if (returnedValue === true) {
                        // true means we would like to return null *but* the ready method was already
                        // called
                        returnedValue = void(0);
                    } else if (returnedValue instanceof Meteor.Error) {
                        this.ready();
                        // SECURITY: We do not cut the subscription because:
                        // 1. this causes our existing client code to continually try to recreate the
                        // subscription
                        // 2. which causes our server to behave badly.  (log gets filled with these log
                        // messages)
                        // 3. we need to modify the client code to deal with an onError condition.
                        // 4. we may be in the process of login in so the security issue may be transient
                        // 5. we may not care
                        //thatManager.log("stopping subscription with error to client.",
                        //returnedValue.message);
                        //this.error(returnedValue);
                        returnedValue = null;
                    }
                    return returnedValue;
                };
                return wrappedFn;
            }
        },
        redirect: {
            value: function (redirectUrl, router) {
                var thatManager = this.thatManager;
                thatManager.log("redirect to :", redirectUrl);
                if (redirectUrl == null) {
                    redirectUrl = Meteor.absoluteUrl();
                }
                // TODO: alter window history so that a 'go back' goes to the previous whalepath page (
                // not this redirect page )
                //
                // TODO: except if the previous page is a non-whalepath page.
                router.response.writeHead(302, {
                    'Location': redirectUrl
                });

                router.response.end();
            }
        },

        /**
         * This is a property so that code in a cursor can look like code elsewhere in the manager
         * code. (see docs.meteor.com about this.userId in publish/subscribe functions )
         */
        userId: {
            get: function () {
                // 26 mar 2014 mimics the meteor check in Meteor.userId() to avoid exception being
                // thrown
                var currentInvocation = DDP._CurrentInvocation.get();
                if (currentInvocation) {
                    return Meteor.userId();
                } else {
                    // return undefined so we can tell difference between "no logged on user" and
                    // "we don't know"
                    return void(0);
                }
            }
        },
        user: {
            get: function () {
                // 26 mar 2014 mimics the meteor check in Meteor.userId() to avoid exception being
                // thrown
                var currentInvocation = DDP._CurrentInvocation.get();
                if (currentInvocation) {
                    return Meteor.user();
                } else {
                    // return undefined so we can tell difference between "no logged on user" and
                    // "we don't know"
                    return void(0);
                }
            }
        }
    });
});
