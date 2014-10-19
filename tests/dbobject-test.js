var mcm_dbobj = 'Meteor Collection Management - DbObject - ';

var TEST_COLLECTION_TABLE_NAME = 'testCollectionTableName';
var EJSON = Package.ejson.EJSON;
TestCollectionType = DbObjectType.createSubClass('testCollection',
    [
        'field1',
        'field2'
    ],
    TEST_COLLECTION_TABLE_NAME);

Tinytest.add(mcm_dbobj + '_save', function(test) {
    var t = new TestCollectionType({field1:'value1', field2:'value2'});
    t._save();
    test.isTrue(t._id, 'Id must be set after call to _save: ' + t._id);
    var id_value = t._id;
    t._id = 'override';
    test.equal(t._id, id_value, '_id field is not immutable!');
});

Tinytest.add(mcm_dbobj + 'databaseTable', function(test) {
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

// NOTE: must be global for the TestCollectionTypeComplex.sampleForTestEnum2 usage.
//
SampleForTestEnum = new Enums.Enum({
    one: {
        dbCode: '1_1'
    },
    two: {
        dbCode: '2_1'
    },
    good: {
        dbCode: 'good'
    }
});
// only needed for testing to make sure that SampleForTestEnum is attached to the global
// NOTE: do not call with an actual object.
function __toGlobal(key, value) {
    this[key] = value;
}
__toGlobal('SampleForTestEnum', SampleForTestEnum);

var TestCollectionTypeComplex = DbObjectType.createSubClass('testCollectionComplex',
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
            },
            sampleForTestEnum0: {
                toJSONValue: SampleForTestEnum.toJSONValue,
                fromJSONValue: SampleForTestEnum.fromJSONValue
            },
            sampleForTestEnum1: {
                jsonHelper: SampleForTestEnum
            },
            sampleForTestEnum2: {
                jsonHelper: 'SampleForTestEnum'
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
Tinytest.add(mcm_dbobj + 'Reference fields', function(test) {
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


Tinytest.add(mcm_dbobj + 'to/fromJsonValue', function(test) {
    var complex = new TestCollectionTypeComplex({
        sampleForTestEnum0: SampleForTestEnum.one.dbCode,
        sampleForTestEnum1: SampleForTestEnum.one.dbCode,
        sampleForTestEnum2: SampleForTestEnum.one.dbCode
    });
    var json = complex.toJSONValue();
    test.equal(json.sampleForTestEnum0, SampleForTestEnum.one.dbCode);
    test.equal(json.sampleForTestEnum1, SampleForTestEnum.one.dbCode);
    test.equal(json.sampleForTestEnum2, SampleForTestEnum.one.dbCode);

    var minJson = complex.toJSONValue(['sampleForTestEnum0']);
    test.equal(minJson.sampleForTestEnum0, SampleForTestEnum.one.dbCode);
    test.equal(_.keys(minJson).length, 1);
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

    Tinytest.addAsync(mcm_dbobj + 'Indexes', function(test, done) {
        var table = IndexedCollection.databaseTable;
        var collection = table.getMongoDbCollection();

        collection.indexes( Meteor.bindEnvironment(function(err, indexes) {
            if(err) {
                throw err;
            }
            test.equal(indexes.length, 7, 'indexedCollectionTableName must have indexes: _id, createdAt, lastModifiedAt,indexedField, refField, userId, and fooIds but has '+indexes);
            done();
        }));
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
Tinytest.add(mcm_dbobj + 'createSubClass setting propertyNamesClientCanSet', function(test) {
    test.equal(TestCollectionTypeComplex.prototype.propertyNamesClientCanSet, ['sampleForTestEnum0','sampleForTestEnum1','sampleForTestEnum2','normalField']);

    test.equal(TestSettablePropertiesType.prototype.propertyNamesClientCanSet,
       ["fieldSet","fieldSetGet","notSecuredField","emptyField"]
    );
});

Tinytest.add(mcm_dbobj + 'safeCopying from client', function(test) {
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
         createdAt: 'bad',
        sampleForTestEnum0 : 'good',
        sampleForTestEnum1 : 'good',
        sampleForTestEnum2 : 'good'
    };
    g.extendClient(clientObject);
    _.each(TestCollectionTypeComplex.prototype.propertyNames, function(propertyName) {
        if ( !_.contains(TestCollectionTypeComplex.prototype.propertyNamesClientCanSet, propertyName)) {
            test.notEqual(g[propertyName], 'bad', propertyName);
        } else if (propertyName.substring(0, 'sampleForTestEnum'.length) == 'sampleForTestEnum') {
            test.equal(g[propertyName], SampleForTestEnum.good, propertyName);
        } else {
            test.equal(g[propertyName], 'good', propertyName);
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

Tinytest.add(mcm_dbobj + 'upsertFromUntrusted classmethod error conditions',
function(test) {
    // TO_PAT: Tinytest has a throws method which works like this. Unfortunately, there's no way to
    // print a message, unless you test by exception message string/regex instead of by class.
    // test.throws(function() {
    //     TestUntrustedType.prototype.upsertFromUntrusted(null, null);
    // }, Meteor.Error);

    try {
        TestUntrustedType.prototype.upsertFromUntrusted(null, null);
        test.equal(false, true, 'expected exception to be thrown on TestUntrustedType.prototype.upsertFromUntrusted(null, null)');
    }catch( e) {
        test.equal(e instanceof Meteor.Error, true);
    }
    try {
        TestUntrustedType.prototype.upsertFromUntrusted(undefined, undefined);
        test.equal(false, true,
            "expected exception to be thrown on TestUntrustedType.prototype.upsertFromUntrusted(undefined, undefined)");
    }catch( e) {
        test.equal(e instanceof Meteor.Error, true);
    }

    var nothing=
        TestUntrustedType.prototype.upsertFromUntrusted(
            {forcedValues: {normalField0: 'forced'}}
        );
    test.equal(nothing, null,
        "expected nothing to be returned because nothing done on TestUntrustedType.prototype.upsertFromUntrusted(null,{forcedValues: {normalField0: 'forced'}})");

    try {
        TestUntrustedType.prototype.upsertFromUntrusted({normalField0:'good'}, {forcedValues: {normalField1:'forced'}});
        test.equal(false, true,
            "must have specific lookup to do update. expected exception to be thrown on TestUntrustedType.prototype.upsertFromUntrusted({normalField0:'good'}, {forcedValues: normalField1:'forced'})");
    }catch( e) {
        test.equal(e instanceof Meteor.Error, true);
    }
});

Tinytest.add(mcm_dbobj + 'upsertFromUntrusted classmethod', function(test) {
    // This test assumes we start with a clean db. Is this a mistake?
    // Should we redesign so we don't depend on the db being clean?
    //
    // Hack to clean db, so leftover objects don't ruin the test.
    if ( Meteor.isServer )
        TestUntrustedType.databaseTable.remove({});

    var g;
    var clientObject0 = {
        normalField0: 'good',
        normalField1: 'good'
    };

    // check that g thing doesn't exist in db
    test.equal(TestUntrustedType.databaseTable.find().count(), 0);

    // check upsert inserts
    g = TestUntrustedType.prototype.upsertFromUntrusted(clientObject0);
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

    g = TestUntrustedType.prototype.upsertFromUntrusted(clientObject1);
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);
    test.equal(g.normalField0, 'better');
    test.equal(g.normalField1, 'good');

    // Test with lookup
    var clientObject2 = {
        normalField0: 'better',
        normalField1: 'good'
    };

    g = TestUntrustedType.prototype.upsertFromUntrusted(clientObject0, {lookup:clientObject2});
    test.equal(g.normalField0, 'good');
    test.equal(g.normalField1, 'good');
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    // Test update with forced values
    var msg = 'basic forced values update';
    g = TestUntrustedType.prototype.upsertFromUntrusted(
        clientObject1,
        null,
        {forcedValues: {normalField0: 'forced'}}
    );
    test.equal(g.normalField0, 'forced', msg);
    test.equal(g.normalField1, 'good', msg);
    test.equal(TestUntrustedType.databaseTable.find().count(), 1);

    // Test insert with forced values.
    msg = 'basic forced values insert';
    g = TestUntrustedType.prototype.upsertFromUntrusted(
        clientObject0,
        {forcedValues: {normalField0: 'forced'}}
    );
    test.equal(TestUntrustedType.databaseTable.find().count(), 2);
    test.equal(g.normalField0, 'forced', msg);
    test.equal(g.normalField1, 'good', msg);

    // test null values.
    var h = TestUntrustedType.databaseTable.findOne({_id: { $ne: g._id } });
    var gOriginal = g.normalField0;
    var hOriginal = h.normalField0;

    g = TestUntrustedType.databaseTable.findOne({_id: g._id });
    h = TestUntrustedType.databaseTable.findOne({_id: h._id });
    test.equal(g.normalField0, gOriginal);
    test.equal(h.normalField0, hOriginal);
    test.equal(TestUntrustedType.databaseTable.find().count(), 2);

    msg = 'looking at db to compare to original';
    g = TestUntrustedType.databaseTable.findOne({_id: g._id });
    h = TestUntrustedType.databaseTable.findOne({_id: h._id });
    test.equal(g.normalField0, gOriginal, msg);
    test.equal(h.normalField0, hOriginal, msg);
    test.equal(TestUntrustedType.databaseTable.find().count(), 2);

    // TODO(dmr) descr
    msg = 'null, null, forced';
    g = TestUntrustedType.databaseTable.findOne({_id: g._id });
    h = TestUntrustedType.databaseTable.findOne({_id: h._id });
    test.equal(g.normalField0, gOriginal, msg);
    test.equal(h.normalField0, hOriginal, msg);
    test.equal(TestUntrustedType.databaseTable.find().count(), 2, msg);

    msg = 'null, query, null';
    TestUntrustedType.prototype.upsertFromUntrusted(null, {lookup:clientObject0});
    g = TestUntrustedType.databaseTable.findOne({_id: g._id });
    h = TestUntrustedType.databaseTable.findOne({_id: h._id });
    test.equal(g.normalField0, gOriginal, msg);
    test.equal(h.normalField0, hOriginal, msg);
    test.equal(TestUntrustedType.databaseTable.find().count(), 2, msg);

    // We can force values even if no client object is supplied.
    msg = 'null, lookup, forced';
    TestUntrustedType.prototype.upsertFromUntrusted(
        null,
        {lookup: clientObject0, forcedValues: {normalField0: 'forced'}}
    );
    g = TestUntrustedType.databaseTable.findOne({_id: g._id });
    h = TestUntrustedType.databaseTable.findOne({_id: h._id });
    test.equal(g.normalField0, 'forced', msg);
    test.equal(h.normalField0, hOriginal, msg);
    test.equal(TestUntrustedType.databaseTable.find().count(), 2);

    // TODO(dmr) test that we don't update multiple objects if
    // multiple objects match the lookup (we can't, but test anyway).
});

Tinytest.add(mcm_dbobj + 'upsertFromUntrusted instance method', function(test) {
    var msg;
    if ( Meteor.isServer )
        TestUntrustedType.databaseTable.remove({});

    var g;
    var clientObject0 = {
        normalField0: 'zomg',
        normalField1: 'zomg'
    };

    // REDUNDANT
    // check that g thing doesn't exist in db
    test.equal(TestUntrustedType.databaseTable.find(clientObject0).count(), 0);

    // check upsert inserts
    g = new TestUntrustedType(clientObject0);
    // new instance from client
    g = g.upsertFromUntrusted();
    // REDUNDANT
    test.equal(TestUntrustedType.databaseTable.find(clientObject0).count(), 1);

    msg = 'update with instance method.';
    g = g.upsertFromUntrusted({normalField0: 'bbqz'});
    test.equal(g.normalField0, 'bbqz', msg);

    msg = 'instance method updates receiver.';
    g.upsertFromUntrusted({normalField0: 'xxxx'});
    test.equal('xxxx', g.normalField0, msg);
});

RequiredFieldsType = DbObjectType.createSubClass('testCollectionWithRequiredFields',
    [
        {'field1' : {required: true}},

        'field2'
    ],
    'testCollectionWithRequiredFieldsTable');

Tinytest.add(mcm_dbobj + 'required fields', function(test) {
    var t = new RequiredFieldsType({field2:'value2'});
    var failed = false;
    try {
        t.checkSelf();
    } catch(e) {
        failed = true;
        test.isTrue(e.message.indexOf('field1') > -1, 'Looks like self check did not find unset field1.');
    }
    test.isTrue(failed, 'checkKeys did not fail with unset required property.');
});

var TestEnumType = DbObjectType.createSubClass('testEnumType',
    [
        {
            x: {
                jsonHelper: SampleForTestEnum
            }
        }
    ],
    'testEnumTable'
);

Tinytest.add('MCM - DbObject - jsonHelper', function(test) {
    var te = new TestEnumType();
    te.x = SampleForTestEnum.one;
    te._save();

    test.equal(SampleForTestEnum.one, te.x, 'before save');
    var rte = TestEnumType.databaseTable.findOneById(te.id);
    test.notEqual(null, rte.x, 'retrieved != null');
    test.notEqual(undefined, rte.x, 'retrieved != undefined');
    test.notEqual(SampleForTestEnum.one.dbCode, rte.x, 'retrieved is not dbCode');
    test.equal(SampleForTestEnum.one, rte.x, 'retrieved is enum obj');
});

TestOrType = DbObjectType.createSubClass('testOrCollection',
    [
        'a',
        'b'
    ],
    'testOrCollection'
);


//Tinytest.add('MCM - DbObject - no or collision', function(test) {
Tinytest.add(mcm_dbobj + 'no or collision', function(test) {
    if (Meteor.isServer) {
        TestOrType.databaseTable.remove({});
    }

    if (TestOrType.databaseTable._originalFind) {
        TestOrType.databaseTable.find = TestOrType.databaseTable._originalFind.bind(
            TestOrType.databaseTable
        );
    }

    var x0 = new TestOrType({
        a: 1,
        b: 2
    });

    var x1 = new TestOrType({
        a: 3,
        b: 4
    });

    var x2 = new TestOrType({
        a: 5,
        b: 6
    });


    x0._save();
    x1._save();
    x2._save();

    test.equal(TestOrType.databaseTable.find().count(), 3, '3 objs');

    var selector = {
        $or: [ { a: 1 }, { a: 3 } ]
    };

    test.equal(TestOrType.databaseTable.find(selector).count(), 2, 'single or');

    var selector1 = {
        $or: [
            { a: 1 }, { a: 3 },
            { b: 2 }, { b: 6 }
        ]
    };

    test.equal(TestOrType.databaseTable.find(selector1).count(), 3, 'one big or');

    var selector2 = {
        $and: [
            {
                $or: [ { a: 1 }, { a: 3 } ]
            },
            {
                $or: [ { b: 2 }, { b: 6 } ]
            }
        ]
    };

    test.equal(TestOrType.databaseTable.find(selector2).count(), 1, 'and 2 ors');

    var selector3 = {
        $or: [ { a: 1 }, { a: 3 } ],
        $or: [ { b: 2 }, { b: 6 } ]
    };

    test.equal(TestOrType.databaseTable.find(selector3).count(), 2, 'just 2 ors (clobbered)');

    var dbCollection = TestOrType.databaseTable;
    dbCollection._originalFind = dbCollection.find.bind(dbCollection);
    dbCollection.find = function() {
        var args = Array.prototype.slice.call(arguments);
        if (Meteor.isServer) {
            // we're doing db.find({})
            var selector;
            if (args.length == 0) {
                selector = {};
                // args == selector : rest ; rest could be []
            } else {
                selector = args.shift();
            }
            // modify selector
            // if collection has required roles, user roles
            // var roles = Meteor.user().roles;

            var roles = ['su', 'customer'];
            var roleQueries = _.map(roles, function(role) {
                return { requiredRoles: role };
            });
            var noRequiredRolesQuery = { requiredRoles: { $exists: false } };
            roleQueries.unshift(noRequiredRolesQuery);

            var newSelector = {
                $and: [
                    { $or: roleQueries },
                    selector
                ]
            };
            args.unshift(newSelector);
        }
        return this._originalFind.apply(this, args);
    };

    test.equal(TestOrType.databaseTable.find().count(), 3, 'patched find (3)');
    test.equal(TestOrType.databaseTable.find(selector).count(), 2, 'patched single or');
});
