var testEnum = new Enums.Enum({
    one: {
        displayName: 'ONE',
    },
    two: {
        displayName: 'TWO',
        dbCode: '_two'
    },
    three: {
        displayName: 'THREE',
        dbCode: '_three'
    }
});

Tinytest.add('Meteor Collection Management - enums - equals', function(test) {
    test.equal(testEnum.one, testEnum.enumOf('one'));
    test.equal(testEnum.one === testEnum.enumOf('one'), true);
});

Tinytest.add('Meteor Collection Management - enums - display', function(test) {
    test.equal(testEnum.one.displayName, 'ONE');
});

Tinytest.add('Meteor Collection Management - enums - array', function(test) {
    var enumsArray = testEnum.toArray(['one','three']);
    test.equal(enumsArray, [testEnum.one, testEnum.three]);
    test.equal(enumsArray.toString(), 'ONE,THREE');
});

Tinytest.add('Meteor Collection Management - enums - auto dbCode', function(test) {
    test.equal(testEnum.one.dbCode, 'one', 'Default DbCode was not initialized.');
    test.equal(testEnum.three.dbCode, '_three', 'Default DbCode was not initialized.');
    test.equal(testEnum.enumOf('_three'), testEnum.three);
    test.equal(testEnum.enumOf('one'), testEnum.one);
});
