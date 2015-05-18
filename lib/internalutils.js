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
 *
 * if 'name_1' property exists on the object:
 *    'name_1' is a object - this is additional definition ( use case server is extending basic
 *    definition)
 *    'name_1' is a function - this function is the method
 *    'name_1'+'Cursor' or 'name_1'+'Method' is a function ( this overrides 'name_1' being a function
 *
 * @param argumentArrayOrObject - if null then nothing will be done.
 * @param definitionProcessingFunction
 * @param mergeExistingDefinition true - look for existing definition already attached to object.
 * @param functionKey - 'method' or 'cursor' - used to find function that will be invoked.
 *
 * Note: this is used by both DbObjectType and ManagerType
 */
// TO_PAT: If we find ourselves having to expend nontrivial maintainence effort on this, one thought
// might be to permit only definitions consisting of a single object, with keys equal to either
// 'default' (or true, to mean the same thing) or an object of special properties.
handleStringOrObjectDefinition = function(
    argumentArrayOrObject, definitionProcessingFunction, mergeExistingDefinition, functionKey
) {
    'use strict';
    var that = this;
    if (_.isEmpty(argumentArrayOrObject) ) {
        // allow caller to be lazy - mcm library user may not have defined some properties.
        return;
    }
    if ( !_.isFunction(definitionProcessingFunction)) {
        throw new Meteor.Error(
            500,
            "definitionProcessingFunction: must be a function: "+typeof definitionProcessingFunction
        );
    }
    mergeExistingDefinition = !!mergeExistingDefinition;
    var suffixKey;
    if ( functionKey ) {
        suffixKey = functionKey.substring(0,1).toUpperCase()+functionKey.substring(1);
    }

    function handleObjectContainingDefinition(definition, definitionName) {
        function handleFunctionDefinition(possibleFunction) {
            var refinedDefinition = {};
            if ( possibleFunction != null ) {
                if (_.isFunction(possibleFunction)) {
                    refinedDefinition[functionKey] = possibleFunction;
                } else if ( _.isObject(possibleFunction)) {
                    _.extend(refinedDefinition, possibleFunction);
                } else {
                    debugger;
                    throw new Meteor.Error(
                        500,
                        definitionName + ": is not a function or object but is a "+
                            typeof possibleFunction
                    );
                }
            }
            return refinedDefinition;
        }
//        console.log("defining ",definitionName, ' ', definition);
        var actualDefinition = handleFunctionDefinition(definition);
        var existingDefinition;
        if (!_.isFunction(that) || definitionName != 'name' ) {
            // HACK : DbObjectType is a function. in javascript functions
            // have a built-in 'name' property.
            // possibly use of hasOwnProperty would work, but I want to make it very clear
            // why the check needs to be made.
            existingDefinition = handleFunctionDefinition(that[definitionName]);
        }

        if ( !mergeExistingDefinition ) {
            // dbObjectType case
            if ( !_.isEmpty(existingDefinition) ) {
                debugger;
                console.warn(definitionName,": existing property will be replaced");
            }
        } else {
            // managerType case
            _.extend(actualDefinition, existingDefinition);
            if ( suffixKey ) {
                // looking for a <definitionName>+"Method" or <definitionName>+"Cursor" property for
                // example.
                var fullFunctionKey = definitionName + suffixKey;
                var existingFunction = that[fullFunctionKey];
                if (_.isFunction(existingFunction)) {
                    var speciallyNamedFunctionDefinition= handleFunctionDefinition(existingFunction);
                    _.extend(actualDefinition, speciallyNamedFunctionDefinition);
                } else if ( that[fullFunctionKey] == null) {
                    // TODO: maybe should be after definitionProcessingFunction() call to allow
                    // definitionProcessingFunction() to supply default functions.
                    //
                    // if the _____Method function does not exist because the definition is
                    // { method: function() } then assign the ____Method = definition.method (or)
                    // _____Cursor = definition.cursor this allows ____Method to always be available
                    // and makes it easier to have a proper this when called
                    // i.e. thatManager.___Method() has this as thatManager
                    // vs. thatManager.___.method()
                    that[fullFunctionKey] = actualDefinition[functionKey];
                }
            }
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
                throw new Meteor.Error(
                    500,
                    "While processing array of definitions; expected a string or object but got: "+
                        typeof nameOrDefinitions+ " :"+nameOrDefinitions
                );
            }
        });
    } else if (argumentArrayOrObject != null && typeof argumentArrayOrObject == 'object') {
        _.each(argumentArrayOrObject, handleObjectContainingDefinition);
    } else {
        throw new Meteor.Error(
            500,
            "expected a array or object but got: "+typeof argumentArrayOrObject
        );
    }
};


/**
 * Used in case where an argument can be value or a function that returns the actual value.
 */
_valueOrFunctionResult = function(valueOrFn, defaultValueIfUndefined) {
    var result;
    if ( typeof valueOrFn === 'function') {
        result = valueOrFn();
    } else {
        result = valueOrFn;
    }
    if ( result === undefined && defaultValueIfUndefined !== undefined ) {
        // note the === we want to preserve null if an explicit null is returned.
        result = defaultValueIfUndefined;
    }
    return result;
};
