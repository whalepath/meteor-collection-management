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
 * @param argumentArray
 * @param definitionProcessingFunction
 */
handleStringOrObjectDefinition = function(argumentArray, definitionProcessingFunction) {
    'use strict';
    if ( _.isArray(argumentArray ) ) {
        _.each(argumentArray, function(nameOrDefinitions) {
            if ( typeof nameOrDefinitions === 'string' ) {
//                console.log("defining ",nameOrDefinitions);
                definitionProcessingFunction({}, nameOrDefinitions);
            } else if (nameOrDefinitions != null && typeof nameOrDefinitions == 'object') {
                handleStringOrObjectDefinition(nameOrDefinitions, definitionProcessingFunction);
            }
        });
    } else if (argumentArray != null && typeof argumentArray == 'object') {
        _.each(argumentArray, function(definition, definitionName) {
//            console.log("defining ",definitionName, ' ', definition);
            definitionProcessingFunction(definition, definitionName);
        });
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
