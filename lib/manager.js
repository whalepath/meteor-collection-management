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

_.extend(ManagerType.prototype, {
    getMeteorCallName: function(meteorCallMethodSuffix) {
        return this.callPrefix +"_"+ meteorCallMethodSuffix;
    },
    getMeteorTopicName: function(meteorTopicSuffix) {
        return this.callPrefix +"_topic_"+ meteorTopicSuffix;
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
    getMeteorTopicCursorFunction: function(meteorTopicSuffix) {
        var cursorName = meteorTopicSuffix + 'Cursor';
        if ( typeof(this[cursorName]) !== "function") {
            // TODO: display better
            throw new Meteor.Error(500, this.toString() +"."+cursorName+" is not a function");
        }
        return this[cursorName];
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
     * @returns {56|104}
     * @private
     */
    _boundFunction: function(functionToBind) {
        var fn = Meteor.bindEnvironment(functionToBind);
        return fn;
    },
    /**
     * Enable turning on/off logging
     */
    log: function() {
        console.log.apply(console,arguments);
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
    findOneUserByUserId: function(userId) {
        return Meteor.users.findOne({_id:userId});
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
 * Call is ManagerType.createSubClass(subClassType, primaryDbObjectType, properties, extensions)
 *      or ManagerType.createSubClass(callPrefix, meteorCallDefinitions, meteorTopics, primaryDbObjectType, properties, extensions)
 * Parameters in order:
 * @param subClassType - constructor function 
 * @param callPrefix - 
 * @param meteorCallDefinitions - 
 * @param meteorTopics - { _____Cursor: function.., ... } - the function can be null for special cases for example topics that don't map directly to a permanent collection
 * @param primaryDbObjectType - 
 */
ManagerType.createSubClass = function() {
    if (arguments.length == 0) {
        throw new Meteor.Error('No arguments in call to ManagerType.createSubClass');
    }
    var subClassType, callPrefix,meteorCallDefinitions, meteorTopicSuffixes, meteorTopics, meteorTopicsParam, primaryDbObjectType, properties, extensions;
    var argIndex = 0;
    if (typeof arguments[0] === 'function') {
        // the call pattern is ManagerType.createSubClass(subClassType, primaryDbObjectType, properties)
        subClassType = arguments[argIndex++];
    } else {
        callPrefix = arguments[argIndex++];
        meteorCallDefinitions = arguments[argIndex++];
        meteorTopicsParam= arguments[argIndex++];
        if ( meteorTopicsParam != null && !_.isArray(meteorTopicsParam)){
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
