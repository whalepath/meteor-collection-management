/**
 * Abstract base class for managers. Subclasses should look like this:

SubClassType = function() {
    ManagerType.call( this, meteorCallDefinitions, meteorTopicDefinitions );
}

ManagerType.create(SubClassType);

for each meteorTopicSuffix there needs to be a method named <meteorTopicSuffix>+'Cursor' (on the
server)
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
Object.defineProperties(ManagerType, {
        // TODO: make an object so can detect instanceof on the server
        Pagination: {
            value: function (options) {
                var pagination = {
                    skip: 0,
                    limit: 30
                };
                if ( options ) {
                    // skip and limit are Mongo options on queries (also ensure that skip is a number)
                    pagination.skip = Number(options.skip) || 0;
                    pagination.limit = Number(options.limit) || 30;
                }
                return pagination;
            },
            enumerable: false,
            writable: false
        }
    }
);

// use ManagerType.prototype.startup
var StartupFunctions = [];

_.extend(ManagerType.prototype, {
    getMeteorCallName: function(meteorCallMethodSuffix) {
        return this.callPrefix +"_"+ meteorCallMethodSuffix;
    },
    /**
     * @param meteorTopicSuffix
     * @returns {string} - The meteorTopic name that is going to be unique ( the manager call prefix
     * is attached )
     */
    getMeteorTopicName: function(meteorTopicSuffix) {
        return this.callPrefix +"_pub_"+ meteorTopicSuffix;
    },
    /**
     * Used only when the server is sending a 'hand-crafted' collection back. (i.e. server is using
     * self.added(), self.changed(), etc.  to create the published cursor instead of a regular
     * mongodb.find() )
     *
     * This method ensure consistent naming of the pseudo collection.
     *
     * @param meteorTopicSuffix
     * @returns {string}
     */
    getMeteorTopicTableName: function(meteorTopicSuffix) {
        return this.callPrefix +"_pub_"+ meteorTopicSuffix+'_Table';
    },
    createMeteorCallMethods : function(meteorCallDefinitions) {
        var thatManager = this.thatManager;
        handleStringOrObjectDefinition.call(thatManager, meteorCallDefinitions,
        function(meteorCallDefinition, meteorCallNameSuffix) {
            thatManager.createMeteorCallMethod(
                // allow a meteorCallNameSuffix in the definition to override
                _.extend({
                    meteorCallNameSuffix: meteorCallNameSuffix
                },
                meteorCallDefinition),
                meteorCallNameSuffix);
        }, true, 'method');
    },
    createTopics : function(meteorTopicDefinitions) {
        var thatManager = this.thatManager;
        handleStringOrObjectDefinition.call(thatManager, meteorTopicDefinitions,
            function(meteorTopicDefinition, meteorTopicSuffix) {
                thatManager.createPublication(
                    // allow a meteorTopicSuffix in the definition to override
                    _.extend({
                            meteorTopicSuffix: meteorTopicSuffix
                        },
                        meteorTopicDefinition),
                    meteorTopicSuffix);
            },
            true, 'cursor');
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
    _defineFindFunctionsForSubscription: function(meteorTopicSuffix, meteorTopicCursorFunction) {
        'use strict';
        var thatManager = this.thatManager;
        var meteorTopicSuffixCapitalized = meteorTopicSuffix.substring(0,1).toUpperCase()
                + meteorTopicSuffix.substring(1);
        /**
         * create the server-side only functions for when we want to use this query on the server
         * find + <meteorTopicSuffix> as the name.
         */
        if ( typeof thatManager['find'+meteorTopicSuffixCapitalized] === 'undefined') {
            thatManager['find' + meteorTopicSuffixCapitalized] = function () {
                var cursor = meteorTopicCursorFunction.apply(thatManager, arguments);
                return cursor;
            };
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
     * if callPrefix: 'foo' then
     *
     * thatManager._getSetting('.bar') (prefix '.') returns
     *    Meteor.settings.public.foo.bar + Meteor.settings.foo.bar
     *
     * thatManager._getSetting('bar') returns
     *    Meteor.settings.public.bar + Meteor.settings.bar
     *
     * thatManager._getSetting()  returns
     *    Meteor.settings.public.foo + Meteor.settings.foo
     *
     * @param settingKey - if starts with '.' then prepend the callPrefix value for this manager.
     * if null then return
     * @param the assets object in the main application.
     * @return
     * @private
     */
    _getSetting: function(settingKey, assets) {
        var thatManager = this.thatManager;
        var key;
        if ( settingKey == null ) {
            key = thatManager.callPrefix;
        } else if ( settingKey.charAt(0) === '.') {
            key = thatManager.callPrefix+settingKey;
        } else {
            key = settingKey;
        }
        var privateValue = _.deep(Meteor.settings, key);
        var publicValue = _.deep(Meteor.settings, ['public', key]);
        // packages can't see to access the main server's private data -so rely on passed in Assets
        if ( typeof privateValue === 'undefined' && typeof publicValue === 'undefined' && assets != null) {
            // nothing in settings. Look for json file
            if ( Meteor.isServer) {
                var filename = key.replace('.', '/')+'.json';
                try {
                    var value = assets.getText(filename);
                    thatManager.debug("LOADING key",key, "from", filename);
                    if (value) {
                        return EJSON.parse(value);
                    }
                } catch(e) {
                    thatManager.log(key, "from", filename, "no asset found");
                }
            }
            return void(0);
        }
        if ( typeof privateValue === 'undefined' ) {
            return publicValue;
        } else if (typeof publicValue === 'undefined') {
            return privateValue;
        } else if ( typeof privateValue === 'object' && typeof publicValue === 'object') {
            var combined = _.extend({}, publicValue, privateValue);
            return combined;
        } else {
            thatManager.fatal("Cannot combine Meteor.settings."+key,"(", typeof privateValue,
                ") and Meteor.settings.public."+key, "(", typeof publicValue, ")");
            return void(0);
        }
    },
    /**
     * functions that run after all the managers are created AND need to check to see if they can
     * run (i.e. expected objects exist) before running.
     * These are functions typically that set up code that requires other managers be created.
     *
     * Best use case is in a Manager.ctor() that needs to reference another manager:
     *
     * {
     *    ctor: function() {
     *        var thatManager = this.thatManager;
     *        thatManager.startup({
     *            canRun: function() {
     *                return typeof AnotherManager !== "undefined" && AnotherManager != null;
     *            },
     *            execute: function() {
     *                var thatManager = this.thatManager;
     *                AnotherManager.doSomething();
     *            }
     *        },
     *        {
     *            execute: function() {
     *               // no restrictions
     *            }
     *        },
     *        function anotherExecute() {
     *            // another execute function
     *        }
     *        );
     *    }
     * }
     *
     *
     * { canRun: function() { return true if the execute function can run (optional)},
     *   execute: function() { function to run if canRun is undefined or returns true },
     * } or
     * just the execute function.
     *
     * Note: can be called without a 'this' if startupFunctions need to be added without a manager.
     */
    startup: function(startupFns) {
        var startupFunctions;
        if ( arguments[0] instanceof Array ) {
            startupFunctions = [].concat(arguments[0]);
        } else {
            startupFunctions = Array.prototype.slice.call(arguments, 0);
        }
        _.each(startupFunctions, function(startupFn) {
            if (startupFn ==  null ) {
                throw new Error('ManagerType.prototype.startup() supplied a null/undefined object');
            } else if ( typeof startupFn === 'function' ) {
                StartupFunctions.push({ execute: startupFn });
            } else if (typeof startupFn !== 'object'){
                throw new Error(
                    'ManagerType.prototype.startup()',
                    'called with something other than a non-empty objects'
                );
            } else if (typeof startupFn.execute === 'function') {
                if ( startupFn.canRun === true || startupFn.canRun == null) {
                    StartupFunctions.push(_.omit(startupFn, 'canRun'));
                } else if ( startupFn.canRun === false ) {
                    // do nothing
                } else if ( typeof startupFn.canRun === 'function') {
                    StartupFunctions.push(startupFn);
                } else {
                    throw new Error(
                        "ManagerType.prototype.startup() called with a object that has a 'canRun' that is not true/false/function. Keys="+
                        Object.keys(startupFn));
                }
            } else {
                throw new Error(
                    "ManagerType.prototype.startup() called with a object that has no 'execute' function. Keys="+
                        Object.keys(startupFn)
                );
            }
        });
    },
    /**
     * execute the register startup functions ( called by internal code - user of this library
     * typically does not need to do their own call to this function)
     */
    executeStartupFunctions: function() {
        var executedAFunction = true;
        var executedCount = 0;
        // loop until all functions have executed or no functions report that they can execute.
        while(executedAFunction) {
            var functionsToExecute = _.filter(StartupFunctions, function(startupObject) {
                return !('executed' in startupObject)
                    && (!('canRun' in startupObject) || startupObject.canRun());
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
            ManagerType.prototype.log(
                'meteor-collections-management:',
                StartupFunctions.length - executedCount,
                'startup functions never could execute'
            );
        }
    },
    __bind: function(functionToBind, self, argsArray) {
        var thatManager = this.thatManager;
        var fn;
        // make copy in case call was: _wrapAsyncFunction(aFunction, aThis, arguments)
        if (argsArray != null) {
            var argsArr = Array.prototype.slice.call(argsArray, 0);
            var bindArgs = [self].concat(argsArr);
            fn = functionToBind.bind.apply(functionToBind, bindArgs);
        } else {
            fn = functionToBind.bind(self);
        }
        return fn;
    },
    /**
     * Return a function that is Meteor bound to the current environment.
     * this will be the current Manager.
     *
     * Used for cases where delayed handling is needed ( such as in S3 callback functions)
     * Use this if you are getting 'current thread must have a fiber'
     * @param functionToBind
     * @param argsArray
     * @returns {56|104}
     * @private
     */
    _boundFunctionWithThis: function(functionToBind, argsArray) {
        var thatManager = this.thatManager;
        var self = this;
        var fn = thatManager._boundFunction(functionToBind, self, argsArray);
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
    _boundFunction: function(functionToBind, self, argsArray) {
        var thatManager = this.thatManager;
        var fn = thatManager.__bind(functionToBind, self, argsArray);
        var fnEnv = Meteor.bindEnvironment(fn);
        return fnEnv;
    },
    /**
     * Meteor.wrapAsync(function, this)
     * @param functionToBind
     * @return {*}
     * @private
     */
    _wrapAsyncFunctionWithThis: function(functionToBind, argsArray) {
        var thatManager = this.thatManager;
        var self = this;
        var fn = thatManager._wrapAsyncFunction(functionToBind, self, argsArray);
        return fn;
    },
    _wrapAsyncFunction: function(functionToBind, self, argsArray) {
        var thatManager = this.thatManager;
        var fn = thatManager.__bind(functionToBind, self, argsArray);
        var fnEnv = Meteor.wrapAsync(fn);
        return fnEnv;
    },
    getFullMeteorTopicDefinition: function(meteorTopicDefinition) {
        var thatManager = this.thatManager;
        var meteorTopicSuffix = meteorTopicDefinition.meteorTopicSuffix;
        if (meteorTopicSuffix == null) {
            throw new Meteor.Error(500, "No meteorTopicSuffix supplied for the meteor topic.");
        }
        var meteorTopicName = thatManager.getMeteorTopicName(meteorTopicSuffix);
        var meteorTopicTableName = thatManager.getMeteorTopicTableName(meteorTopicSuffix);
        // TODO: make as properties
        var fullMeteorTopicDefinition = _.extend({
                meteorTopicName: meteorTopicName,
                meteorTopicTableName: meteorTopicTableName,
                thatManager: thatManager
            },
            meteorTopicDefinition
        );
        return fullMeteorTopicDefinition;
    },
    // we don't want the fullMeteorTopicDefinition.cursor function
    // this allows for different permissionCheck option for example.
    _createFullDerivedDefinition: function(meteorTopicDefinition, derivedDefinition, extensionName) {
        var thatManager = this.thatManager;
        var uppercaseExtensionName = extensionName.charAt(0).toUpperCase()
            + extensionName.substring(1);
        var meteorTopicSuffix = meteorTopicDefinition.meteorTopicSuffix + uppercaseExtensionName;
        var meteorTopicTableName = thatManager.getMeteorTopicTableName(
            meteorTopicSuffix
        );
        var meteorTopicName = this.getMeteorTopicName(meteorTopicSuffix);
        var fullDerivedDefinition = _.extend(
            {},
            _.omit(meteorTopicDefinition, 'cursor', 'derived'),
            // need to make sure parent does not override the following.
            {
                parentMeteorTopicDefinition: meteorTopicDefinition,
                uppercaseExtensionName: uppercaseExtensionName,
                extensionName: extensionName,
                meteorTopicSuffix: meteorTopicSuffix,
                meteorTopicTableName: meteorTopicTableName,
                meteorTopicName: meteorTopicName,
                thatManager: thatManager
            },
            derivedDefinition
        );
        return fullDerivedDefinition;
    },
    _processDerivedCursors: function(fullMeteorTopicDefinition, processFn) {
        var thatManager = this.thatManager;
        if (fullMeteorTopicDefinition.derived) {
            _.each(fullMeteorTopicDefinition.derived, function (derivedDefinition, extensionName) {
                var fullDerivedDefinition = thatManager._createFullDerivedDefinition(fullMeteorTopicDefinition,
                    derivedDefinition, extensionName);
                var wrappedFunction = processFn.call(thatManager, fullDerivedDefinition);
                fullDerivedDefinition.cursor = function() {
                    wrappedFunction.call(this, {
                        arguments:arguments,
                        meteorTopicDefinition: fullDerivedDefinition
                    });
                }
                thatManager.createPublication(fullDerivedDefinition);
            });
        }
    },
    /**
     * entry point for various logging methods
     */
    logMessage: function(logMethod, argumentsObj) {
        var thatManager = this;
        if (console && (typeof console[logMethod] === 'function'
                     || typeof console.log === 'function')) {
            var args = Array.prototype.slice.call(argumentsObj, 0);
            if ( thatManager.callPrefix ) {
                args.unshift(thatManager.callPrefix + ':');
            }
            if (!thatManager.debugging) {
                args.unshift((new Date()).toISOString());
            }
            (console[logMethod] || console.log).apply(console, args);
        }
    },
    /**
     * calls console.log() Add the manager prefix to the logging message
     * Enable turning on/off logging
     */
    log: function() {
        this.logMessage('debug', arguments);
    },
    /**
     * calls console.debug() Add the manager prefix to the logging message
     * Enable turning on/off logging
     */
    debug: function() {
        this.logMessage('debug', arguments);
    },
    // displays stack
    trace: function() {
        this.logMessage('trace', arguments);
    },
    warn: function() {
        this.logMessage('warn', arguments);
    },
    /**
     * calls console.error() Add the manager prefix to the logging message
     * Enable turning on/off logging
     */
    error: function() {
        this.logMessage('error', arguments);
        debugger;
    },
    fatal: function() {
        var thatManager = this.thatManager;
        this.logMessage('fatal', arguments);
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
    },
    // a useful standard permission check
    loggedInPermissionCheck: function (callInfo) {
        return callInfo.userId != null;
    }
});
Object.defineProperties(ManagerType.prototype, {
    debugging: {
        'get': function() {
            return Meteor.settings && Meteor.settings.public && Meteor.settings.public.debug;
        }
    }
});

/**
 *
 * @param options
 *      subClassType
 *      callPrefix
 *      meteorCallDefinitions
 *      meteorTopicDefinitions
 *      primaryDbObjectType
 *      properties
 *      extensions
 *
 * @returns {*}
 */
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
    var extraKeys = Object.keys(_.omit(options, knownOptionKeys));
    if (!_.isEmpty(extraKeys)) {
        throw new Meteor.Error(500,
            "invalid option(s) to ManagerType.create: bad options:" +
            extraKeys+ ", expected:" + knownOptionKeys
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
