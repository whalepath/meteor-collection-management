Meteor.startup(function() {
    _.extend(ManagerType.prototype, {
        /**
         * create the Meteor.method hook:
         * Meteor.method({ <managers_prefix>+meteorCallDefinition : function that will invoke the
         * manager stubName function with this set to the manager instance );
         * @param meteorCallDefinition
         */
        createMeteorCallMethod : function(meteorCallDefinition, meteorCallNameSuffix) {
            var that = this;
            var trackingEventKey;
            var meteorCallNameSuffix;
            var permissionCheck;
            var trackingEventKey = meteorCallDefinition.trackingEventKey;
            var permissions = meteorCallDefinition.permissionCheck;
            var callName = this.getMeteorCallName(meteorCallNameSuffix);
            var methods = {};
            // make sure that the subclass manager is bound as the 'this' parameter when the Meteor
            // method is called.
            if ( typeof(that[meteorCallNameSuffix]) !== "function") {
                // TODO: display better
                throw new Meteor.Error(500, that.toString() +"."+meteorCallNameSuffix+" is not a function");
            }
            var method = that[meteorCallNameSuffix].bind(that);
            permissionCheck = permissionCheck || that[meteorCallNameSuffix].permissionCheck;
            if (permissionCheck) {
                if (_.contains(permissionCheck, 'public')
                    || permissionCheck == 'public') {
                    methods[callName] = method;
                } else {
                    var wrappedMethod = this._wrapMethodWithPermittedRoles(
                        method,
                        permissionCheck,
                        callName
                    );
                    methods[callName] = wrappedMethod;
                }
            } else {
                // Require permissions to be defined
                // TODO :
                console.log("Method has no permissionCheck defined for " + callName);
//                throw new Meteor.Error(500, "Method has no permissionCheck defined for " + callName);
            }
            Meteor.methods(methods);
        },

        /**
         * adds permissions
         * @param method the method
         * @param permissionCheck array of roles
         */
        _wrapMethodWithPermittedRoles: function(method, permissionCheck, callName) {
            var that = this;
            if ( Roles ) {
                var wrappedMethod = function () {
                    if (Roles.userIsInRole(Meteor.user(), permissionCheck)) {
                        return method.apply(that, arguments);
                    } else {
                        throw new Meteor.Error(403, "Current user not permitted to call " + callName);
                    }
                };
                return wrappedMethod;
            } else {
                return method;
            }
        },

        _wrapCursorWithPermittedRoles: function(cursor, permissionCheck, topicName) {
            var that = this;
            if ( Roles ) {
                var wrappedCursor = function () {
                    if (Roles.userIsInRole(this.userId, permissionCheck)) {
                        return cursor.apply(that, arguments);
                    } else {
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
         * Topic is named manager's callPrefix+'_topic_'+meteorTopicSuffix ( see this.getMeteorTopicName() )
         * Meteor.publish/subscribe has a useful 'this': access the meteorTopic name, meteorTopic cursor function, and thatManager in the cursor function:
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
         * This is a property so that code in a cursor can look like code elsewhere in the manager code.
         * (see doc.Meteor.com about this.userId in publish/subscribe functions )
         */
        userId : {
            get : function() {
                // 26 mar 2014 mimics the meteor check in Meteor.userId() to avoid exception being thrown
                var currentInvocation = DDP._CurrentInvocation.get();
                if ( currentInvocation) {
                    return Meteor.userId();
                } else {
                    // return undefined so we can tell difference between "no logged on user" and "we don't know"
                    return void(0);
                }
            }
        }
    });
});
