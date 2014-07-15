var TEST_COLLECTION_TABLE_NAME = 'testCollectionTableName';

TestCollectionType = DbObjectType.createSubClass('testCollection',
    [
        'field1',
        'field2'
    ],
    TEST_COLLECTION_TABLE_NAME);

Tinytest.add('Meteor Collection Management - DbObject - _save', function(test) {
    var t = new TestCollectionType({field1:'value1', field2:'value2'});
    t._save();
    test.isTrue(t._id, 'Id must be set after call to _save: ' + t._id);
    var id_value = t._id;
    t._id = 'override';
    test.equal(t._id, id_value, '_id field is not immutable!');
});

Tinytest.add('Meteor Collection Management - DbObject - databaseTable', function(test) {
    test.isTrue(TestCollectionType.databaseTable, 'Meteor collection wasn\'t initialized.');
    test.isTrue(TestCollectionType.databaseTable instanceof Meteor.Collection, 'databaseTable field is not a meteor collection');
    test.isTrue(TestCollectionType.databaseTable.findById, 'findById method wasn\'t defined on databaseTable');

    var t = new TestCollectionType({field1:'value1', field2:'value2'});
    t._save();
    var cursor = TestCollectionType.databaseTable.findById(t._id);
    test.isTrue(cursor, 'Find by id didn\'t return a cursor.');

    var t1 = cursor.fetch()[0];
    test.equal(t1._id, t._id, 'Fetched and requested ids do not match.');
    test.isTrue(t.equals(t1), 'Fetched object doesn\'t equal to saved: ' + t1 );

    test.isTrue(TestCollectionType.databaseTable.findOneById, 'findOneById method wasn\'t defined on databaseTable');
    var t2 = TestCollectionType.databaseTable.findOneById(t._id);
    test.equal(t2._id, t._id, 'Fetched and requested ids do not match.');
    test.isTrue(t.equals(t2), 'Fetched object doesn\'t equal to saved: ' + t2 );
});

//Tinytest.add('Meteor Collection Management - DbObject - toJsonValue', function(test) {
//TODO
//});

//Tinytest.add('Meteor Collection Management - DbObject - fromJsonValue', function(test) {
//TODO
//});


TestCollectionTypeComplex = DbObjectType.createSubClass('testCollectionComplex',
    [
        {
            refField : {
                reference: true
            },

            refField2 : {
                reference: true
            },
            aDate: {
                'get': function() {
                    return new Date();
                }
            }

        },
        'normalField',
        'anArrayOfIds',
        'anotherCollectionsId',
        {
            securedField: {
                security: true
            }
        }
    ],
    'testCollectionTableNameComplex');

// TODO(dmr) this test had transient failure a couple of times during
// development of extendClientWithForcedValues. Check whether there
// were relevant changes, or if this is just a buggy/brittle test.
//
// I don't think there were any relevant changes and detected no
// pattern in the failures. So I think it's buggy/brittle.
//
// Message:
// - ok (4 times)
// - fail — string_equal - message Wrong entry found. - expected
// Yt4aNmoPzSShSmhZw
// - actual
// pgqbT4Tmb6W4re9MB
Tinytest.add('Meteor Collection Management - DbObject - Reference fields', function(test) {
    test.isTrue(TestCollectionTypeComplex.databaseTable.findOneByRefField, 'Reference field findOneBy selector wasn\'t created.');
    test.isTrue(TestCollectionTypeComplex.databaseTable.findByRefField, 'Reference field findBy selector wasn\'t created.');
    test.isFalse(TestCollectionTypeComplex.databaseTable.findByNormalField, 'Selector for normal field was created!');
    var d = new Date();
    var n = d.getMilliseconds();
    var refValue = 'refValue' + n;
    var normalValue = 'normal' + refValue;

    var t = new TestCollectionTypeComplex();
    t.refField = refValue;
    t.normalField = normalValue;
    t._save();
    var t2 = TestCollectionTypeComplex.databaseTable.findOneByRefField(refValue);
    test.isTrue(t2, 'Value by reference field was not found.');
    test.equal(t2._id, t._id, 'Wrong entry found.');

    var t3 = TestCollectionTypeComplex.databaseTable.findByRefField(refValue);
    test.isTrue(t3 != null && t3.count() > 0, 'Malformed cursor returned');
    //Verify ref field is writable even though it wasn't explicitly requested.
    t.refField = 'new value';
    test.equal(t.refField, 'new value', 'refField is not writable (but should be).')
});

if (Meteor.isServer) {
    IndexedCollection = DbObjectType.createSubClass('indexedCollection', [
           'normalField',
           {'indexedField' : {indexed: true}},
           {'refField' : {reference: true}},
           // test case 'by default' reference parameters
           'userId',
           'fooIds',
           // 'id' ending should not be flagged as an id ( because words can end in 'id' )
           'notanid',
           'nottheids',
           'valid'
        ],
    'indexedCollectionTableName');
    var t = new IndexedCollection({normalField:'value'});
    t._save();

    var MongoClient = Npm.require('mongodb').MongoClient;
    MongoClient.connect(process.env.MONGO_URL, function(err, db) {
        if(err) throw err;
        Tinytest.addAsync('Meteor Collection Management - DbObject - Indexes', function(test, done) {
            var table = IndexedCollection.databaseTable;
            var collection = db.collection('indexedCollectionTableName');
            collection.indexes( Meteor.bindEnvironment(function(err, indexes) {
              if(err) throw err;
              test.equal(5, indexes.length, 'indexedCollectionTableName must have 3 indexes: _id, indexedField, refField, userId, and fooIds');
              done();
            }));
        });
//        db.close();
    });
}

TestSettablePropertiesType = DbObjectType.createSubClass('testSettableProperties',
    [
        {
            refField : {
                reference: true
            },
            fieldGet: {
                'get': function() {
                    return new Date();
                }
            },
            fieldSet: {
                'set': function() {
                    // something
                }
            },
            fieldSetGet: {
                'get': function() {
                    return new Date();
                },
                'set': function(value) {
                    this.fieldSetGet = value+1;
                }
            },
            securedField: {
                security: true
            },
            notSecuredField: {
                security: false
            },
            emptyField: {}
        }
    ],
    'testSettablePropertiesTableName');


// TODO: Since we found a bug in createSubClass's population of
// propertyNamesClientCanSet, we may want to do more complicated
// testing of it, since it's pretty important.
Tinytest.add('Meteor Collection Management - DbObject - createSubClass setting propertyNamesClientCanSet', function(test) {
    test.equal(['normalField'], TestCollectionTypeComplex.prototype.propertyNamesClientCanSet);

    test.equal(TestSettablePropertiesType.prototype.propertyNamesClientCanSet,
               ["fieldSet","fieldSetGet","notSecuredField","emptyField"]
              );
});

Tinytest.add('Meteor Collection Management - DbObject - safeCopying from client', function(test) {
    test.equal(['normalField'], TestCollectionTypeComplex.prototype.propertyNamesClientCanSet);
    var g = new TestCollectionTypeComplex();
    var clientObject = {
         id:'bad',
         refField : 'bad',
         refField2 : 'bad',
         aDate: 'bad',
         normalField: 'good',
         anArrayOfIds: 'bad',
         anotherCollectionsId:'bad',
         securedField: 'bad',
         createdAt: 'bad'
    };
    g.extendClient(clientObject);
    _.each(TestCollectionTypeComplex.prototype.propertyNames, function(propertyName) {
        if ( _.contains(TestCollectionTypeComplex.prototype.propertyNamesClientCanSet, propertyName)) {
            test.equal(g[propertyName], 'good');
        } else {
            test.notEqual(g[propertyName], 'bad');
        }
    });
});

TestUntrustedType = DbObjectType.createSubClass(
    'testUntrusted',
    [
        'normalField0',
        'normalField1'
    ],
    'testUntrustedTableName'
);


Tinytest.add('Meteor Collection Management - DbObject - upsertFromUntrusted thing0', function(test) {
    // This test assumes we start with a clean db. Is this a mistake?
    // Should we redesign so we don't depend on the db being clean?
    //
    // Hack to clean db, so leftover objects don't ruin the test.
    if ( Meteor.isServer )
        TestUntrustedType.databaseTable.remove({});

    var g = new TestUntrustedType();
    var clientObject0 = {
        normalField0: 'good',
        normalField1: 'good'
    };

    // check that g thing doesn't exist in db
    test.equal(TestUntrustedType.databaseTable.find().count(), 0);

    // check upsert inserts
    g.upsertFromUntrusted(clientObject0);
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    // check upsert sets
    test.equal(g.normalField0, 'good');
    test.equal(g.normalField1, 'good');

    // this represents an object we sent to the client, which is
    // coming back with modifications.
    var clientObject1 = {
        _id: g._id,
        normalField0: 'better',
        normalField1: 'good'
    };

    g.upsertFromUntrusted(clientObject1);
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);
    test.equal(g.normalField0, 'better');
    test.equal(g.normalField1, 'good');

    // Test with lookup
    var clientObject2 = {
        normalField0: 'better',
        normalField1: 'good'
    };

    g.upsertFromUntrusted(clientObject0, clientObject2);
    test.equal(g.normalField0, 'good');
    test.equal(g.normalField1, 'good');
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    // Test with forced values
    g.upsertFromUntrusted(clientObject1, null, {normalField0: 'forced'});
    test.equal(g.normalField0, 'good');
    test.equal(g.normalField1, 'good');
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    // TODO(dmr) test insert with forced values.

    // test null values.
    var original = g.normalField0;
    g.upsertFromUntrusted(null, null, null);
    test.equal(g.normalField0, original);
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    // test undefined too.
    g.upsertFromUntrusted(undefined, undefined, undefined);
    test.equal(g.normalField0, original);
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    g.upsertFromUntrusted(null, null, {normalField0: 'forced'});
    test.equal(g.normalField0, original);
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    g.upsertFromUntrusted(null, clientObject0, null);
    test.equal(g.normalField0, original);
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    // We can force values even if no client object is supplied.
    g.upsertFromUntrusted(null, clientObject0, {normalField0: 'forced'});
    test.equal(g.normalField0, 'forced');
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    // TODO(dmr) test that we don't update multiple objects if
    // multiple objects match the lookup (we can't, but test anyway).
});
