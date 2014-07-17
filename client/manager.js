Meteor.startup(function() {
    _.extend(ManagerType.prototype, {
        /**
         * Create the Meteor call stubs for the client.
         * Defines this[meteorCallDefinition] to the call function.
         * To handle return results, the *last* argument should be a callback function ( function(error, results) )
         * @param meteorCallDefinition
         */
        createMeteorCallMethod : function(meteorCallDefinition) {
            var thatManager = this;
            var trackingEventKey;
            if ( typeof(meteorCallDefinition) == "undefined" || meteorCallDefinition ==null) {
                return;
            } else if ( typeof(meteorCallDefinition) === "object") {
                meteorCallNameSuffix = meteorCallDefinition.callName;
                trackingEventKey = meteorCallDefinition.trackingEventKey;
                trackingEventData = meteorCallDefinition.trackingEventData
            } else {
                // assumed meteorCallDefinition is string
                meteorCallNameSuffix = meteorCallDefinition;
            }
            var meteorCallName = this.getMeteorCallName(meteorCallNameSuffix);
            // Create the client function that will call the server-side function with the same name.
            // This allows code to be location agnostic: if the outside code is running on the client: the Meteor call will happen,
            // if it is running on the server - the call will be a direct javascript call.
            thatManager[meteorCallNameSuffix] = function() {
                var args = Array.prototype.slice.call(arguments);
                // look for callback function that will be called with the result the server returns.
                var callback;
                if ( args.length > 0) {
                    if ( typeof args[args.length-1] == "function") {
                        callback = args.pop();
                    } else {
                        callback = null;
                    }
                }
                if ( trackingEventKey ) {
                    // TODO: make 'TrackingManager' less wp specific : maybe a lookup/property etc.
                    TrackingManager && TrackingManager.track(trackingEventKey);
                }
                thatManager.log("calling "+meteorCallName);
                return Meteor.apply(meteorCallName, args, null, callback);
            };
            // make the underlying Meteor method name available for Meteor libraries that need to know the Meteor call ( like MeteorFile )
            Object.defineProperties(thatManager[meteorCallNameSuffix], {
                meteorCallName : {
                    value : meteorCallName,
                    writable : false
                }
            });
        },
        /**
         * Creates a method this[meteorTopicSuffix] which will subscribe to the meteorTopic with the provided arguments and return the subscribe handle.
         * Also attaches to the returned meteorTopic handle these functions:
         *     results(),
         *     oneResult(),
         *     and cursor()
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
         * var subscribeHandle = AssetManager.reportPresentations('34'); // subscribe passing '34' to the server for subscription.
         * subscribeHandle.results(); // return when subscribeHandle.ready() == true call AssetManager.reportPresentationsCursor('34').fetch();
         * subscribeHandle.oneResult(); // return when subscribeHandle.ready() == true call AssetManager.reportPresentationsCursor('34').fetch()[0];
         *
         * @param meteorTopicSuffix
         */
        createTopic : function(meteorTopicSuffix) {
            var thatManager = this;
            var meteorTopicName = this.getMeteorTopicName(meteorTopicSuffix);
            var meteorTopicCursorFunction = thatManager.getMeteorTopicCursorFunction(meteorTopicSuffix, true);
            if ( meteorTopicCursorFunction == null) {
                thatManager.log(meteorTopicName+": supplying default custom client meteorTopic function");
                var meteorTopicTableName = thatManager.getMeteorTopicTableName(meteorTopicSuffix);
                // no cursor function on client, means a hand-crafter meteorTopic with self.added() and such calls.
                //
                // create the receiving collection on the client side (with a unique name)
                thatManager[meteorTopicTableName] = new Meteor.Collection(meteorTopicTableName);
                // create the expected cursor function - that does no selection.
                thatManager[meteorTopicSuffix+'Cursor'] = meteorTopicCursorFunction = function() {
                    // note: no selection criteria because the server will only return the needed results.
                    var results = thatManager[meteorTopicTableName].find();
                    return results;
                }
            }
            // TODO: for some subscriptions ( i.e. currentHuman ) no arguments - the handle should be saved on the manager so that we don't have
            // multiple subscribes/unsubscribes
            // creates the stub subscribe method
            this[meteorTopicSuffix+'Handle'] = function() {
                var passedArguments = Array.prototype.slice.call(arguments, 0);
                var args = Array.prototype.slice.call(arguments, 0);
                args.unshift(meteorTopicName);
                var handle = Meteor.subscribe.apply(Meteor,args);
                thatManager.log("subscribing to "+meteorTopicName);

                /**
                 *  create a results() function that will return an array of the results.
                 *  This works by calling the manager's cursor function and passing the same arguments that were passed to the subscribe meteorTopic.
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
                 * @type {oneResult}
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
            // TODO: make this return the results.
            this[meteorTopicSuffix] = function() {
                var args = Array.prototype.slice.call(arguments, 0);
                thatManager.log(meteorTopicSuffix+': (WARNING) called instead of '+meteorTopicSuffix+'Handle');
                var handle = thatManager[meteorTopicSuffix+'Handle'].apply(thatManager, args);
                return handle;
            }

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
