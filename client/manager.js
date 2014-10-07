Meteor.startup(function() {
    'use strict';
    _.extend(ManagerType.prototype, {
        /**
         * Create the Meteor call stubs for the client.
         * Defines this[meteorCallDefinition] to the call function.
         * To handle return results, the *last* argument should be a callback function (
         * function(error, results) )
         * @param meteorCallDefinition
         */
        createMeteorCallMethod : function(meteorCallDefinition, meteorCallNameSuffix) {
            var thatManager = this;
            var trackingEventKey;
            var trackingEventData;
            var meteorCallName = this.getMeteorCallName(meteorCallNameSuffix);
            if ( typeof(meteorCallDefinition) === "object") {
                trackingEventKey = meteorCallDefinition.trackingEventKey;
                trackingEventData = meteorCallDefinition.trackingEventData;
            }
            // Create the client function that will call the server-side function with the same name.
            // This allows code to be location agnostic: if the outside code is running on the
            // client: the Meteor call will happen, if it is running on the server - the call will
            // be a direct javascript call.
            Object.defineProperty(thatManager, meteorCallNameSuffix, {
                value : function() {
                    var args = Array.prototype.slice.call(arguments);
                    // look for callback function that will be called with the result the server returns.
                    var callback;
                    if (args.length > 0) {
                        if (typeof args[args.length - 1] == "function") {
                            callback = args.pop();
                        } else {
                            callback = null;
                        }
                    }
                    if (trackingEventKey) {
                        // TODO: make 'TrackingManager' less wp specific : maybe a lookup/property etc.
                        TrackingManager && TrackingManager.track(trackingEventKey);
                    }
                    thatManager.log("calling ", meteorCallName);
                    return Meteor.apply(meteorCallName, args, null, callback);
                },
                writable: false
            });
            // make the underlying Meteor method name available for Meteor libraries that need to
            // know the Meteor call ( like MeteorFile )
            Object.defineProperties(thatManager[meteorCallNameSuffix], {
                meteorCallName : {
                    value : meteorCallName,
                    writable : false
                }
            });
        },
        /**
         * Creates a function this[meteorTopicSuffix+'Handle'].
         *
         * this[meteorTopicSuffix+'Handle'](<Meteor-subscribe-arguments>) will take its arguments,
         * add the correct meteor topic name to the beginning, and passed the new argument array to
         * the Meteor.subscribe method
         *
         * The handle returned by Meteor.subscribe
         * Also attaches to the returned meteorTopic handle these functions:
         *     findFetch(),
         *     findOne(),
         *     and findcursor()
         *
         * Most/All meteorTopics are created with manager is created
         *
         * Example:
         *
         * AssetManager.createTopic('reportPresentations')
         * (AssetManager.reportPresentationsCursor must exist)
         * causes:
         *
         * AssetManager.reportPresentations function to be created.
         *
         * var subscribeHandle = AssetManager.reportPresentationsHandle('34'); // subscribe passing '34' to the server for subscription.
         * subscribeHandle.findFetch(); // return when subscribeHandle.ready() == true call AssetManager.reportPresentationsCursor('34').fetch();
         * subscribeHandle.findOne(); // return when subscribeHandle.ready() == true call AssetManager.reportPresentationsCursor('34').fetch()[0];
         *
         * @param meteorTopicSuffix
         */
        createTopic : function(meteorTopicDefinition, meteorTopicSuffix) {
            var thatManager = this;
            var meteorTopicName = this.getMeteorTopicName(meteorTopicSuffix);
//            var meteorTopicCursorFunction = thatManager.getMeteorTopicCursorFunction(meteorTopicSuffix, true);
            var meteorTopicCursorFunction = meteorTopicDefinition.cursor;
            if ( meteorTopicCursorFunction == null) {
                // client has no 'Cursor' function defined. This happens when the server side has a
                // non-standard topic. For example, a topic that is created with manually with :
                // http://docs.meteor.com/#publish_added
                // see http://docs.meteor.com/#publishandsubscribe for more info.
                // no cursor function on client, means a hand-crafted meteorTopic with self.added()
                // and such calls.
                // create the receiving collection on the client side (with a unique name)
                var meteorTopicTableName = thatManager.getMeteorTopicTableName(meteorTopicSuffix);
                thatManager.log(meteorTopicName+": supplying default custom client meteorTopic function, and client-side-only databaseTable named:"+meteorTopicTableName, " to hold the results.");
                thatManager[meteorTopicTableName] = new Meteor.Collection(meteorTopicTableName);
                // create the expected cursor function - that does no selection.
                thatManager[meteorTopicSuffix+'Cursor'] = meteorTopicCursorFunction = function() {
                    // note: no selection criteria because the server will only return the needed
                    // results.
                    var results = thatManager[meteorTopicTableName].find();
                    return results;
                };
            }
            // TODO: for some subscriptions ( i.e. currentHuman ) no arguments - the handle
            // should be saved on the manager so that we don't have multiple subscribes/unsubscribes
            //
            // creates the stub subscribe method
            this[meteorTopicSuffix+'Handle'] = function() {
                var args = Array.prototype.slice.call(arguments, 0);
                args.unshift(meteorTopicName);
                var handle = Meteor.subscribe.apply(Meteor,args);

                var passedArguments = Array.prototype.slice.call(arguments, 0);
                var lastPassedArgument = passedArguments
                        && passedArguments.length > 0?passedArguments[passedArguments.length-1]:null;
                if ( lastPassedArgument
                     && (typeof lastPassedArgument == 'function'
                         || typeof lastPassedArgument.onReady === 'function'
                         || typeof lastPassedArgument.onError === 'function')) {
                    // a onready or onError handlers - remove from arguments that will be passed to
                    // the cursor function
                    passedArguments.pop();
                }
                thatManager.log("subscribing to "+meteorTopicName);

                /**
                 *  create a results() function that will return an array of the results.
                 *  This works by calling the manager's cursor function and passing the same
                 *  arguments that were passed to the subscribe meteorTopic.
                 * @returns undefined if the handle is not ready.
                 */
                handle.find = handle.cursor = function() {
                    var resultsCursor = void(0);
                    if ( handle.ready() ) {
                        resultsCursor = meteorTopicCursorFunction.apply(thatManager,passedArguments);
                    }
                    return resultsCursor;
                };
                handle.findFetch = handle.results = function() {
                    var results = void(0);
                    var resultsCursor = this.find();
                    if ( resultsCursor != null ) {
                        results = resultsCursor.fetch();
                    }
                    return results;
                };
                /**
                 * function that returns only a single result ( if the results are ready)
                 * @returns
                 */
                handle.findOne = handle.oneResult = function() {
                    var results = this.findFetch();
                    if ( results === undefined) {
                        return void(0);
                    }
                    if (_.isArray(results) && results.length ) {
                        return results[0];
                    } else {
                        return null;
                    }
                };

                return handle;
            };
            thatManager._defineFindFunctionsForTopic(meteorTopicSuffix, meteorTopicCursorFunction);
        }
    });
    Object.defineProperties(ManagerType.prototype, {
        userId: {
            'get' : function() {
                // always safe on client
                return Meteor.userId();
            }
        }
    });
});
