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
           {'refField' : {reference: true}}
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
              test.equal(3, indexes.length, 'indexedCollectionTableName must have 3 indexes: _id, indexedField and refField');
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

    // TODO: Confirm that these are actually the fields the client can set.
    test.equal(TestSettablePropertiesType.prototype.propertyNamesClientCanSet,
               ["fieldSet","fieldSetGet","notSecuredField","emptyField"]
              );
});

// TODO: DMR 11 July 2014 something wrong with this test
Tinytest.add('Meteor Collection Management - DbObject - safeCopying from client', function(test) {
    // This is a bug (test should not pass). We define 'aDate' as not
    // writable (i.e. with only a get), but createSubClass sets
    // 'aDate' in propertyNamesClientCanSet.
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

