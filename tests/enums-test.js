var EJSON = Package.ejson.EJSON;
var TestingEnumFake = new Enums.Enum({
    typeName: 'testingEnumFake',
    defs: {
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
    },
    properties: {
        printMe: {
            get: function() {
                return 'printMe';
            }
        }
    }
});

Tinytest.add('Meteor Collection Management - enums - simple', function(test) {
    return;
    // TODO: Fix to handle this.
    var simpleEnum0 = new Enums.Enum(['ff', 'bb']);
    var simpleEnum1 = new Enums.Enum('ff', 'bb');
});

Tinytest.add('Meteor Collection Management - enums - keys', function(test) {
    var keys = _.keys(TestingEnumFake);
    test.equal(keys,[TestingEnumFake.one.name, TestingEnumFake.two.name, TestingEnumFake.three.name]);
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
    test.equal(enumsArray.toString(), 'one,_three');
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
    var jsonArray = TestingEnumFake.toJSONValue([TestingEnumFake.three, TestingEnumFake.one, null, void(0)]);
    test.equal(jsonArray,
        ['_three', 'one'],
        'Not handling array.');
});

Tinytest.add('Meteor Collection Management - enums - hasOwnProperty', function(test) {
    test.isTrue(TestingEnumFake.one.hasOwnProperty('displayName'));
});

Tinytest.add('Meteor Collection Management - enums - testExtraProperties', function(test) {
    test.equal(TestingEnumFake.printMe, 'printMe', 'Problem with adding extra properties on the Enum object.');
    test.equal(TestingEnumFake.one.printMe, 'printMe', 'Problem with adding extra properties on the Enum.Symbol object.');
});

Tinytest.add('Meteor Collection Management - enums - EJSON', function(test) {
    var ejsonStringify = EJSON.stringify(TestingEnumFake.one);
    var jsonParse = JSON.parse(ejsonStringify);
    test.equal(TestingEnumFake.one.typeName(), jsonParse["$type"], 'TypeName mismatch');
    test.equal(TestingEnumFake.one.dbCode, jsonParse["$value"], 'DbCode mismatch');
    var back = EJSON.parse(ejsonStringify);
    test.isTrue(TestingEnumFake.one === back);
});

/**
 * case where the enum was not properly serialized to the dbCode.
 * This happens if the enum was serialized by code that was not aware of how the enum should be serialized.
 * In this case we end up with a object with the same properties but it is not a symbol.
 */
Tinytest.add('Meteor Collection Management - enums - accidently serialized', function(test) {
    var accidentalClone = {};
    _.each(TestingEnumFake.one, function(element, key){
        accidentalClone[key] = element;
    });
    var testingEnumFakeValue = TestingEnumFake.toJSONValue(accidentalClone);
    test.equal(TestingEnumFake.one.toJSONValue(), testingEnumFakeValue, 'accidental serialization case was not handled');
    var testingEnumFakeEnum = TestingEnumFake.fromJSONValue(accidentalClone);
    test.equal(TestingEnumFake.one, testingEnumFakeEnum, 'accidental serialization case was not handled');
});


Tinytest.add('Meteor Collection Management - enums - inMongoDb', function(test) {
    var i = 0;
    var mongoDb = TestingEnumFake.one.asMongoDb();
    test.equal(mongoDb, { testingEnumFake: 'one'}, 'MongoDb mismatch '+(i++));

    mongoDb = TestingEnumFake.inMongoDb(TestingEnumFake.one);
    test.equal(mongoDb, { testingEnumFake: 'one'}, 'MongoDb mismatch '+(i++));

    mongoDb = TestingEnumFake.ninMongoDb(TestingEnumFake.one);
    test.equal(mongoDb, { testingEnumFake: {$ne :'one'}}, 'MongoDb mismatch '+(i++));

    mongoDb = TestingEnumFake.inMongoDb(TestingEnumFake.one, TestingEnumFake.two);
    test.equal(mongoDb, { testingEnumFake: {$in:['one', '_two']}}, 'MongoDb mismatch '+(i++));

    mongoDb = TestingEnumFake.ninMongoDb(TestingEnumFake.one, TestingEnumFake.two);
    test.equal(mongoDb, { testingEnumFake: {$nin:['one', '_two']}}, 'MongoDb mismatch '+(i++));

    mongoDb = TestingEnumFake.one.ninMongoDb();
    test.equal(mongoDb, { testingEnumFake: { $ne: 'one'}}, 'MongoDb mismatch '+(i++));

    mongoDb = TestingEnumFake.one.ninMongoDb(TestingEnumFake.two);
    test.equal(mongoDb, { testingEnumFake: {$nin:['_two', 'one']}}, 'MongoDb mismatch '+(i++));

    // now test with field names
    mongoDb = TestingEnumFake.one.asMongoDb('fieldName');
    test.equal(mongoDb, { fieldName: 'one'}, 'MongoDb mismatch '+(i++));
    mongoDb = TestingEnumFake.inMongoDb('fieldName', TestingEnumFake.one);
    test.equal(mongoDb, { fieldName: 'one'}, 'MongoDb mismatch '+(i++));
    mongoDb = TestingEnumFake.one.ninMongoDb('fieldName');
    test.equal(mongoDb, { fieldName: {$ne: 'one'}}, 'MongoDb mismatch '+(i++));
    mongoDb = TestingEnumFake.one.ninMongoDb('fieldName',TestingEnumFake.two);
    test.equal(mongoDb, { fieldName: {$nin:['_two', 'one']}}, 'MongoDb mismatch '+(i++));

});
