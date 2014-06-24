var testEnum = new Enums.Enum({
    one: {
        displayName: 'ONE'
    },
    two: {
        displayName: 'TWO'
    },
    three: {
        displayName: 'THREE'
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
});
