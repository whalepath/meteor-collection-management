var TestingEnumFake = new Enums.Enum({
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
    test.equal(TestingEnumFake.one, TestingEnumFake.enumOf('one'));
    test.equal(TestingEnumFake.one === TestingEnumFake.enumOf('one'), true);
});

Tinytest.add('Meteor Collection Management - enums - display', function(test) {
    test.equal(TestingEnumFake.one.displayName, 'ONE');
});

Tinytest.add('Meteor Collection Management - enums - array', function(test) {
    var enumsArray = TestingEnumFake.toArray(['one','three']);
    test.equal(enumsArray, [TestingEnumFake.one, TestingEnumFake.three]);
    test.equal(enumsArray.toString(), 'ONE,THREE');
});

Tinytest.add('Meteor Collection Management - enums - auto dbCode', function(test) {
    test.equal(TestingEnumFake.one.dbCode, 'one', 'Default DbCode was not initialized.');
    test.equal(TestingEnumFake.three.dbCode, '_three', 'DbCode was not initialized.');
    test.equal(TestingEnumFake.enumOf('_three'), TestingEnumFake.three);
    test.equal(TestingEnumFake.enumOf('one'), TestingEnumFake.one);
});

Tinytest.add('Meteor Collection Management - enums - toJSONValue/fromJSONValue', function(test) {
    test.equal(TestingEnumFake.one.toJSONValue(), 'one', 'Default DbCode was not initialized.');
    test.equal(TestingEnumFake.three.toJSONValue(), '_three', 'DbCode was not initialized.');
    var jsonArray = TestingEnumFake.toJSONValue([TestingEnumFake.three, TestingEnumFake.one]);
    test.equal(jsonArray,
        ['_three', 'one'],
        'Not handling array.');
});
