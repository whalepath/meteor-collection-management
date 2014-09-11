/**
 * Abstract base class for managers. Subclasses should look like this:

SubClassType = function() {
    ManagerType.call( this, meteorCallDefinitions, meteorTopicSuffixes );
}

ManagerType.createSubClass(SubClassType);

for each meteorTopicSuffix there needs to be a method named <meteorTopicSuffix>+'Cursor' (on the server)
 *
 * @constructor
 */
ManagerType = function(callPrefix, meteorCallDefinitions, meteorTopicSuffixes) {
    var thatManager = this;
    // self-reference so that within cursor functions there is consistently available 'thatManager'
    thatManager.thatManager = thatManager;
    if (! callPrefix instanceof String ) {
        throw new Meteor.Error("No call prefix supplied");
    }
    Object.defineProperties(this, {
        callPrefix : {
            value : callPrefix,
            writable : false
        }
    });
    thatManager.createMeteorCallMethods(meteorCallDefinitions);
    thatManager.createTopics(meteorTopicSuffixes);
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
        var thatManager = this;
        _.each(meteorCallDefinitions, function(meteorCallDefinition) {
            thatManager.createMeteorCallMethod(meteorCallDefinition);
        });
    },
    createTopics : function(meteorTopicSuffixes) {
        var thatManager = this;
        _.each(meteorTopicSuffixes, function(meteorTopicSuffix){
            thatManager.createTopic(meteorTopicSuffix);
        });
    },
    /**
     * looks for function with meteorTopicSuffix+'Cursor' name
     * @param meteorTopicSuffix
     * @returns {*} the function
     */
    getMeteorTopicCursorFunction: function(meteorTopicSuffix, okMissing) {
        var cursorName = meteorTopicSuffix + 'Cursor';
        if ( typeof(this[cursorName]) === 'function') {
            return this[cursorName];
        } else if ( okMissing !== true ) {
            // TODO: display better
            throw new Meteor.Error(500, this.toString() +"."+cursorName+" is not a function");
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
    _defineFindFunctionsForTopic: function(meteorTopicSuffix) {
        var thatManager = this;
        var meteorTopicCursorFunction = thatManager.getMeteorTopicCursorFunction(meteorTopicSuffix);
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
        var args  = Array.prototype.slice.call(arguments, 0);
        args.unshift(this.callPrefix+ ': ');
//        var now = new Date();
//        args.unshift(now.getUTCFullYear()+'-'+(now.getUTCMonth()+1)+'-'+now.getUTCDate()+'-'+now.getUTCHours()+'-'+now.getUTCMinutes()+':'+now.getUTCSeconds()+' :');
        console.log.apply(console,args);
    },
    find: function() {
        if ( this.databaseTable == null ) {
            throw new Error('no databaseTable property set');
        }
        return this.databaseTable.find.apply(this.databaseTable, arguments);
    },
    findOne: function() {
        if ( this.databaseTable == null ) {
            throw new Error('no databaseTable property set');
        }
        return this.databaseTable.findOne.apply(this.databaseTable, arguments);
    },
    findById: function(id) {
        if ( this.databaseTable == null ) {
            throw new Error('no databaseTable property set');
        }
        if ( id ) {
            return this.databaseTable.findById(id);
        } else {
            return null;
        }
    },
    findOneById: function(id) {
        var cursor = this.findById(id);
        if ( cursor ) {
            return cursor.fetch()[0];
        } else {
            return null;
        }
    },
    /**
     * calls console.debug() Add the manager prefix to the logging message
     * Enable turning on/off logging
     */
    debug: function() {
        var args  = Array.prototype.slice.call(arguments, 0);
        args.unshift(this.callPrefix+ ': ');
//        var now = new Date();
//        args.unshift(now.getUTCFullYear()+'-'+(now.getUTCMonth()+1)+'-'+now.getUTCDate()+'-'+now.getUTCHours()+'-'+now.getUTCMinutes()+':'+now.getUTCSeconds()+' :');
        console.debug.apply(console,args);
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
    debug: {
        'get': function() {
            return Meteor.settings && Meteor.settings.public && Meteor.settings.public.debug;
        }
    }
});

/**
 * Call is: (preferred):  ManagerType.createSubClass(callPrefix, meteorCallDefinitions, meteorTopics, primaryDbObjectType, properties, extensions)
 *    or ManagerType.createSubClass(subClassType, primaryDbObjectType, properties, extensions)
 * Parameters in order:
 * @param subClassType - constructor function  (optional)
 * @param callPrefix - 
 * @param meteorCallDefinitions - 
 * @param meteorTopics - { _____Cursor: function.., ... } - the function can be null for special cases for example meteorTopics that don't map directly to a permanent collection
 * @param primaryDbObjectType - 
 */
ManagerType.createSubClass = function() {
    if (arguments.length == 0) {
        throw new Meteor.Error('No arguments in call to ManagerType.createSubClass');
    }
    var subClassType, callPrefix,meteorCallDefinitions, meteorTopicSuffixes, meteorTopics, meteorTopicsParam, primaryDbObjectType, properties, extensions;
    var argIndex = 0;
    if (typeof arguments[0] === 'function') {
        // caller supplied the subclass constructor function
        // the call pattern is ManagerType.createSubClass(subClassType, primaryDbObjectType, properties)
        subClassType = arguments[argIndex++];
    } else {
        callPrefix = arguments[argIndex++];
        meteorCallDefinitions = arguments[argIndex++];
        meteorTopicsParam= arguments[argIndex++];
        if ( meteorTopicsParam != null && !_.isArray(meteorTopicsParam)){
            /*
             * Given meteorTopicsParam = { fooCursor: fn(){} },
             * set meteorTopicsSuffixes = ['foo'];
             * 
             * Question 0: Do we do this b/c of requirement "for each
             * meteorTopicSuffix there needs to be a method named
             * <meteorTopicSuffix>+'Cursor' (on the server)" So to
             * guarantee this, we generate meteorTopic suffix list from
             * topics -> topic cursor function hash?
             *
             * Question 1: If yes on 0, why? Is it to guarantee that
             * someone can refer to 'human' only if someone has
             * defined humanCursor?
             */
            meteorTopicSuffixes = [];
            meteorTopics = {};
            _.each(meteorTopicsParam, function(cursorFunction, cursorName) {
                // remove the trailing 'Cursor' in the name
                meteorTopicSuffixes.push( cursorName.substring(0, cursorName.length-6));
                if ( cursorFunction ) {
                    meteorTopics[cursorName] = cursorFunction;
                }
            });
        } else {
            meteorTopicSuffixes = meteorTopicsParam || [];
        }
        // the default subclass constructor
        subClassType = function() {
            ManagerType.call( this, callPrefix, meteorCallDefinitions, meteorTopicSuffixes);
        };
    }
    primaryDbObjectType = arguments[argIndex++];
    properties = arguments[argIndex++] || {};
    extensions = arguments[argIndex++] || {};

    subClassType.prototype = Object.create(ManagerType.prototype, properties);
    subClassType.prototype.constructor = subClassType;
    if ( primaryDbObjectType ) {
        Object.defineProperties(subClassType.prototype, {
            primaryDbObjectType : {
                value: primaryDbObjectType,
                writable: false,
            },
            databaseTable : {
                value: primaryDbObjectType.databaseTable,
                writable: false,
            },
        });
    }
    if ( meteorTopics ) {
        _.extend(subClassType.prototype, meteorTopics);
    }
    _.extend(subClassType.prototype, extensions);
    return subClassType;
}
