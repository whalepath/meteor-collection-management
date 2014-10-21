/**
 * Abstract base class for managers. Subclasses should look like this:

SubClassType = function() {
    ManagerType.call( this, meteorCallDefinitions, meteorTopicDefinitions );
}

ManagerType.createSubClass(SubClassType);

for each meteorTopicSuffix there needs to be a method named <meteorTopicSuffix>+'Cursor' (on the server)
 *
 * @constructor
 */
ManagerType = function(callPrefix, meteorCallDefinitions, meteorTopicDefinitions) {
    'use strict';
    var thatManager = this;
    if (! callPrefix instanceof String ) {
        throw new Meteor.Error(500, "No manager prefix supplied");
    }
    Object.defineProperties(this, {
        callPrefix : {
            value : callPrefix,
            writable : false,
            enumerable: true,
            configurable: false
        },
        // self-reference so that within cursor functions there is consistently available 'thatManager'
        // so in all functions we can do:
        //   var thatManager = this.thatManager; ( even if 'this' is a cursor and not a manager )
        thatManager: {
            value: thatManager,
            // not enumerable to avoid infinite loops when using libraries that stringify objects.
            enumerable: false,
            writable: false,
            configurable: false
        }
    });
    thatManager.createMeteorCallMethods(meteorCallDefinitions);
    thatManager.createTopics(meteorTopicDefinitions);
    if ( typeof this.ctor == "function") {
        this.ctor.apply(this,arguments);
    }
};

// use ManagerType.prototype.startup
var StartupFunctions = [];

_.extend(ManagerType.prototype, {
    getMeteorCallName: function(meteorCallMethodSuffix) {
        return this.callPrefix +"_"+ meteorCallMethodSuffix;
    },
    /**
     * @param meteorTopicSuffix
     * @returns {string} - The meteorTopic name that is going to be unique ( the manager call prefix is attached )
     */
    getMeteorTopicName: function(meteorTopicSuffix) {
        return this.callPrefix +"_topic_"+ meteorTopicSuffix;
    },
    /**
     * Used only when the server is sending a 'hand-crafted' collection back. (i.e. server is using self.added(), self.changed(), etc.
     * to create the published cursor instead of a regular mongodb.find() )
     *
     * This method ensure consistent naming of the pseudo collection.
     *
     * @param meteorTopicSuffix
     * @returns {string}
     */
    getMeteorTopicTableName: function(meteorTopicSuffix) {
        return this.callPrefix +"_topic_"+ meteorTopicSuffix+'_Table';
    },
    createMeteorCallMethods : function(meteorCallDefinitions) {
        var thatManager = this.thatManager;
        handleStringOrObjectDefinition.call(thatManager, meteorCallDefinitions, function(meteorCallDefinition, meteorCallNameSuffix) {
            thatManager.createMeteorCallMethod(meteorCallDefinition, meteorCallNameSuffix);
        }, true, 'method');
    },
    createTopics : function(meteorTopicDefinitions) {
        var thatManager = this.thatManager;
        handleStringOrObjectDefinition.call(thatManager, meteorTopicDefinitions, function(meteorTopicDefinition, meteorTopicSuffix) {
            thatManager.createTopic(meteorTopicDefinition, meteorTopicSuffix);
        }, true, 'cursor');
    },
    /**
     * looks for function with meteorTopicSuffix+'Cursor' name
     * @param meteorTopicSuffix
     * @param okMissing - set to true on client, no cursor function needed when
     * the server is publishing to a unique client-only collection.
     * @returns {*} the function
     */
    getMeteorTopicCursorFunction: function(meteorTopicSuffix, okMissing) {
        var thatManager = this.thatManager;
        var cursorName = meteorTopicSuffix + 'Cursor';
        if ( typeof(this[cursorName]) === 'function') {
            return this[cursorName];
        } else if ( okMissing !== true ) {
            // TODO: display better
            throw new Meteor.Error(500, this.callPrefix +"."+cursorName+" is not a function");
        } else {
            return null;
        }
    },
    /**
     * Define on the manager
     *   find<meteorTopicSuffix>
     *   findFetch<meteorTopicSuffix>
     *   findOne<meteorTopicSuffix>
     *       functions.
     *
     * @param meteorTopicSuffix
     * @private
     */
    _defineFindFunctionsForTopic: function(meteorTopicSuffix, meteorTopicCursorFunction) {
        var thatManager = this;
//        var meteorTopicCursorFunction = thatManager.getMeteorTopicCursorFunction(meteorTopicSuffix);
        var meteorTopicSuffixCapitalized = meteorTopicSuffix.substring(0,1).toUpperCase() + meteorTopicSuffix.substring(1);
        /**
         * create the server-side only functions for when we want to use this query on the server
         * find + <meteorTopicSuffix> as the name.
         */
        if ( typeof thatManager['find'+meteorTopicSuffixCapitalized] === 'undefined') {
            thatManager['find' + meteorTopicSuffixCapitalized] = function () {
                var cursor = meteorTopicCursorFunction.apply(thatManager, arguments);
                return cursor;
            }
        }
        // mirror of findFetch on client-side
        if ( typeof thatManager['findFetch'+meteorTopicSuffixCapitalized] === 'undefined') {
            thatManager['findFetch'+meteorTopicSuffixCapitalized] = function () {
                var cursor = meteorTopicCursorFunction.apply(thatManager, arguments);
                if (cursor != null) {
                    return cursor.fetch();
                } else {
                    return void(0);
                }
            };
        }
        /**
         * findOne + <meteorTopicSuffix> as the name.
         */
        if ( typeof thatManager['findOne'+meteorTopicSuffixCapitalized] === 'undefined') {
            thatManager['findOne'+meteorTopicSuffixCapitalized] = function () {
                var cursor = meteorTopicCursorFunction.apply(thatManager, arguments);
                if (cursor != null) {
                    return cursor.fetch()[0];
                } else {
                    return void(0);
                }
            };
        }
    },
    /**
     * functions that run after all the managers are created AND need to check to see if they can run (i.e. expected objects exist) before running.
     * These are functions typically that set up code that requires multiple managers be created.
     *
     * { canRun: function() { return true if the execute function can run },
     *   execute: function() { function to run if canRun is undefined or returns true },
     * } or
     * just the execute function.
     */
    startup: function(startupFns) {
        var startupFunctions = [].concat(Array.prototype.slice.call(arguments, 0));
        _.each(startupFunctions, function(startupFn) {
            if ( typeof startupFn === 'function' ) {
                StartupFunctions.push({canRun: function() { return true; }, execute: startupFn });
            } else if ( startupFn != null && (typeof startupFn === 'object') && !_.isEmpty(startupFn) ) {
                StartupFunctions.push(startupFn);
            } else {
                throw new Error('ManagerType.prototype.startup() called with something other than an non-empty objects');
            }
        });
    },
    /**
     * execute the register startup functions ( called by internal code - user of this library typically does not need to do their own call to this function)
     */
    executeStartupFunctions: function() {
        var executedAFunction = true;
        var executedCount = 0;
        // loop until all functions have executed or no functions report that they can execute.
        while(executedAFunction) {
            var functionsToExecute = _.filter(StartupFunctions, function(startupObject) {
                return !('executed' in startupObject) && (!('canRun' in startupObject) || startupObject.canRun());
            });
            executedAFunction = !_.isEmpty(functionsToExecute);
            if ( executedAFunction ) {
                _.each(functionsToExecute, function(startupObject) {
                    startupObject.execute();
                    startupObject.executed = true;
                    executedCount++;
                });
            }
        }   
        if ( executedCount != StartupFunctions.length ) {
            ManagerType.prototype.log('meteor-collections-management:'+StartupFunctions.length - executedCount+ ' startup functions never could execute');
        }
    },
    /**
     * Return a function that is Meteor bound to the current environment.
     * this will be the current Manager.
     *
     * Used for cases where delayed handling is needed ( such as in S3 callback functions)
     * Use this if you are getting 'current thread must have a fiber'
     * @param functionToBind
     * @returns {56|104}
     * @private
     */
    _boundFunctionWithThis: function(functionToBind) {
        var fn = this._boundFunction(functionToBind.bind(this));
        return fn;
    },
    /**
     * Return a function that is Meteor bound to the current environment
     * this is not set
     * Used for cases where delayed handling is needed ( such as in S3 callback functions)
     * Use this if you are getting 'current thread must have a fiber'
     * @param functionToBind
     * @returns bound function
     * @private
     */
    _boundFunction: function(functionToBind) {
        var fn = Meteor.bindEnvironment(functionToBind);
        return fn;
    },
    /**
     * calls console.log() Add the manager prefix to the logging message
     * Enable turning on/off logging
     */
    log: function() {
        if ( console && typeof console.log === 'function') {
            // fucking IE 9 which sometimes does not have console available
            var args = Array.prototype.slice.call(arguments, 0);
            args.unshift(this.callPrefix + ': ');
            //        var now = new Date();
            //        args.unshift(now.getUTCFullYear()+'-'+(now.getUTCMonth()+1)+'-'+now.getUTCDate()+'-'+now.getUTCHours()+'-'+now.getUTCMinutes()+':'+now.getUTCSeconds()+' :');
            console.log.apply(console, args);
        }
    },
    /**
     * calls console.debug() Add the manager prefix to the logging message
     * Enable turning on/off logging
     */
    debug: function() {
        if ( console && typeof console.log === 'function') {
            // fucking IE 9 which sometimes does not have console available
            var args = Array.prototype.slice.call(arguments, 0);
            args.unshift(this.callPrefix + ': ');
            //        var now = new Date();
            //        args.unshift(now.getUTCFullYear()+'-'+(now.getUTCMonth()+1)+'-'+now.getUTCDate()+'-'+now.getUTCHours()+'-'+now.getUTCMinutes()+':'+now.getUTCSeconds()+' :');
            // on server-side console.debug does not exist
            (console.debug || console.log).apply(console, args);
        }
    },
    // displays stack
    trace: function() {
        if ( console && typeof console.log === 'function') {
            // fucking IE 9 which sometimes does not have console available
            var args = Array.prototype.slice.call(arguments, 0);
            args.unshift(this.callPrefix + ': ');
            //        var now = new Date();
            //        args.unshift(now.getUTCFullYear()+'-'+(now.getUTCMonth()+1)+'-'+now.getUTCDate()+'-'+now.getUTCHours()+'-'+now.getUTCMinutes()+':'+now.getUTCSeconds()+' :');
            (console.trace || console.log).apply(console, args);
        }
    },
    warn: function() {
        if ( console && typeof console.log === 'function') {
            // fucking IE 9 which sometimes does not have console available
            var args = Array.prototype.slice.call(arguments, 0);
            args.unshift(this.callPrefix + ': ');
            //        var now = new Date();
            //        args.unshift(now.getUTCFullYear()+'-'+(now.getUTCMonth()+1)+'-'+now.getUTCDate()+'-'+now.getUTCHours()+'-'+now.getUTCMinutes()+':'+now.getUTCSeconds()+' :');
            (console.warn || console.log).apply(console, args);
        }
    },
    /**
     * calls console.error() Add the manager prefix to the logging message
     * Enable turning on/off logging
     */
    error: function() {
        if ( console && typeof console.log === 'function') {
            // fucking IE 9 which sometimes does not have console available
            var args = Array.prototype.slice.call(arguments, 0);
            args.unshift(this.callPrefix + ': ');
            //        var now = new Date();
            //        args.unshift(now.getUTCFullYear()+'-'+(now.getUTCMonth()+1)+'-'+now.getUTCDate()+'-'+now.getUTCHours()+'-'+now.getUTCMinutes()+':'+now.getUTCSeconds()+' :');
            (console.error || console.log).apply(console, args);
        }
    },
    fatal: function() {
        var thatManager = this.thatManager;
        thatManager.error.apply(thatManager, arguments);
        debugger;
        var message = thatManager.safeEJSONStringify.apply(thatManager, arguments);
        throw new Meteor.Error(500, message?message:"stringified failed.");
    },
    safeEJSONStringify: function() {
        var thatManager = this.thatManager;
        var message;
        try {
            message = EJSON.stringify(arguments);
            return message;
        } catch(error) {
            thatManager.error("stringify failed.");
        }
    },
    findOneUserById: function(userId) {
        return Meteor.users.findOne({_id:userId});
    },
    updateFromUntrusted: function(changes, lookupFn, permittedKeys) {
        currentObj = lookupFn();
        if ( currentObj == null ) {
            return null;
        }

        if ( !_.isEmpty(changes) ) {
            var pickArgs = _.clone(permittedKeys);
            pickArgs.unshift(changes);
            // TODO(dmr) thread in pickClient
            _.extend(currentObj, _.pick.call(null, pickArgs));
            human._save();
        }

        return currentObj;
    }
});
Object.defineProperties(ManagerType.prototype, {
    debugging: {
        'get': function() {
            return Meteor.settings && Meteor.settings.public && Meteor.settings.public.debug;
        }
    }
});

// WIP: replacement for createSubClass, intented to be more comprehensible and self-documenting.
ManagerType.create = function(options) {
    'use strict';
    // TODO: comments to explain keys.
    var knownOptionKeys = [
        // Optional constructor.
        // TODO: change name to 'constructor' or similar
        'subClassType',
        'callPrefix',
        'meteorCallDefinitions',
        'meteorTopicDefinitions',
        'primaryDbObjectType',
        'properties',
        'extensions'
    ];
    if (Object.keys(options).length == 0) {
        throw new Meteor.Error(500,'No options in call to ManagerType.create');
    }
    if (!_.isEmpty(_.omit(options, knownOptionKeys))) {
        throw new Meteor.Error(500,
            "invalid option(s) to ManagerType.create:",
            _.omit(options, knownOptionKeys)
        );
    }

    var callPrefix = options.callPrefix;
    var meteorCallDefinitions = options.meteorCallDefinitions;
    var meteorTopicDefinitions = options.meteorTopicDefinitions;
    var processedTopicDefinitions = {};
    var meteorTopics;
    // process topic definitions
    if ( meteorTopicDefinitions != null && _.isObject(meteorTopicDefinitions)){
        meteorTopics = {};
        _.each(meteorTopicDefinitions, function(singleTopicDefinition, cursorName) {
            // remove the trailing 'Cursor' in the name
            var meteorTopicSuffix;
            var realCursorName;
            if ( cursorName.substring(cursorName.length-6, cursorName.length) === 'Cursor') {
                meteorTopicSuffix = cursorName.substring(0, cursorName.length-6);
                realCursorName = cursorName;
            } else {
                meteorTopicSuffix = cursorName;
                realCursorName = cursorName + 'Cursor';
            }
            if ( singleTopicDefinition ) {
                if (_.isFunction(singleTopicDefinition.cursor)) {
                    meteorTopics[realCursorName] = singleTopicDefinition.cursor;
                } else {
                    meteorTopics[realCursorName] = singleTopicDefinition;
                }
                processedTopicDefinitions[meteorTopicSuffix] = singleTopicDefinition;
            } else {
                processedTopicDefinitions[meteorTopicSuffix] = {};
            }
        });
    }

    var subClassType;
    if (options.subClassType) {
        subClassType = options.subClassType;
    } else {
        // the default subclass constructor
        subClassType = function() {
            ManagerType.call( this, callPrefix, meteorCallDefinitions, processedTopicDefinitions);
        };
    }

    var primaryDbObjectType = options.primaryDbObjectType;
    var properties = options.properties || {};
    var extensions = options.extensions || {};

    subClassType.prototype = Object.create(ManagerType.prototype, properties);
    subClassType.prototype.constructor = subClassType;
    if ( primaryDbObjectType ) {
        Object.defineProperties(subClassType.prototype, {
            primaryDbObjectType : {
                value: primaryDbObjectType,
                writable: false
            },
            databaseTable : {
                value: primaryDbObjectType.databaseTable,
                writable: false
            },
            find: {
                value: primaryDbObjectType.databaseTable.find.bind(primaryDbObjectType.databaseTable),
                writable: false
            },
            findOne: {
                value: primaryDbObjectType.databaseTable.findOne.bind(
                    primaryDbObjectType.databaseTable
                ),
                writable: false
            },
            findById: {
                value: primaryDbObjectType.databaseTable.findById.bind(
                    primaryDbObjectType.databaseTable
                ),
                writable: false
            },
            findOneById: {
                value: primaryDbObjectType.databaseTable.findOneById.bind(
                    primaryDbObjectType.databaseTable
                ),
                writable: false
            }
        });
    }

    if ( meteorTopics ) {
        _.extend(subClassType.prototype, meteorTopics);
    }
    _.extend(subClassType.prototype, extensions);
    return subClassType;
};
