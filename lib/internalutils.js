/**
 * Handle definitions that look like:
 * [
 *      'name_1',
 *      'name_2',
 *      {
 *          'name_3': {
 *             ... special properties ...
 *          },
 *          'name_4': {
 *             ... special properties ...
 *          },
 *      },
 *      'name_5',
 *      {
 *          'name_6': {
 *             ... special properties ...
 *          },
 *          'name_7': {
 *             ... special properties ...
 *          },
 *      },
 * ]
 * @param argumentArrayOrObject - if null then nothing will be done.
 * @param definitionProcessingFunction
 * @param mergeExistingDefinition true - look for existing definition already attached to object.
 */
handleStringOrObjectDefinition = function(argumentArrayOrObject, definitionProcessingFunction, mergeExistingDefinition, functionKey) {
    'use strict';
    var that = this;
    if (_.isEmpty(argumentArrayOrObject) ) {
        // allow caller to be lazy - mcm library user may not have defined some properties.
        return;
    }
    if ( !_.isFunction(definitionProcessingFunction)) {
        throw new Meteor.Error(500, "definitionProcessingFunction: must be a function: "+typeof definitionProcessingFunction);
    }
    mergeExistingDefinition = !!mergeExistingDefinition;

    function handleObjectContainingDefinition(definition, definitionName) {
//            console.log("defining ",definitionName, ' ', definition);
        var actualDefinition;
        var existingDefinition = that[definitionName];
        if ( existingDefinition == null ) {
            actualDefinition = definition;
        } else if ( !mergeExistingDefinition ) {
            actualDefinition = definition;
            if ( existingDefinition ) {
                console.warn(definitionName,": existing property will be replaced");
            }
        } else if (_.isFunction(existingDefinition)) {
            // example: method name is supplied but server and/or client supply additional definition
            // (for example a function or specific permission checks) to augment the definition.
            var additionalDefinition = {};
            additionalDefinition[functionKey] = existingDefinition;
            actualDefinition = _.extend({}, definition, additionalDefinition);
        } else if (!_.isEmpty(existingDefinition) && _.isObject(existingDefinition)) {
            // example: a general method definition is supplied but server has a definition object with something like the method to be run on the server.
            actualDefinition = _.extend({}, definition, existingDefinition);
        } else {
            throw new Meteor.Error(500, definitionName+": existingDefinition is not a function or object");
        }
        definitionProcessingFunction(actualDefinition, definitionName);
    };
    if ( _.isArray(argumentArrayOrObject ) ) {
        // for arrays slice up into strings or objects that have the actual definition.
        _.each(argumentArrayOrObject, function(nameOrDefinitions) {
            if ( typeof nameOrDefinitions === 'string' ) {
                handleObjectContainingDefinition({}, nameOrDefinitions);
            } else if (nameOrDefinitions != null && typeof nameOrDefinitions == 'object') {
                _.each(nameOrDefinitions, handleObjectContainingDefinition);
            } else {
                throw new Meteor.Error(500, "While processing array of definitions; expected a string or object but got: "+typeof nameOrDefinitions+ " :"+nameOrDefinitions);
            }
        });
    } else if (argumentArrayOrObject != null && typeof argumentArrayOrObject == 'object') {
        _.each(argumentArrayOrObject, handleObjectContainingDefinition);
    } else {
        throw new Meteor.Error(500, "expected a array or object but got: "+typeof argumentArrayOrObject);
    }
};


/**
 * Used in case where an argument can be value or a function that returns the actual value.
 */
_valueOrFunctionResult = function(valueOrFn) {
    var result;
    if ( typeof valueOrFn === 'function') {
        result = valueOrFn();
    } else {
        result = valueOrFn;
    }
    return result;
}
