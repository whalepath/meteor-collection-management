Tinytest.add('Meteor Collection Management - underscore-extensions - simple1', function(test) {
    try {
        _.onlyKeysCheck({r1: true, r2:true, o1 : true, wrong:false}, ['r1', 'r2'],['o1']);
    } catch(e) {
        // good
    }
});
Tinytest.add('Meteor Collection Management - underscore-extensions - simple2', function(test) {
    _.onlyKeysCheck({r1: true, r2:true}, ['r1', 'r2']);
    _.onlyKeysCheck({r1: true, r2:true}, ['r1', 'r2'], void 0);
    _.onlyKeysCheck({r1: true, r2:true, o1 : true}, ['r1', 'r2'],['o1']);
    _.onlyKeysCheck({o1: true, o2:true, o3 : true}, [], ['o1', 'o2', 'o3']);
});

Tinytest.add('Meteor Collection Management - underscore-extensions - simple3', function(test) {
    var expected;
    expected = {r1: true, r2:true};
    _.pickRequired({r1: true, r2:true}, ['r1', 'r2']);
    expected = {r1: true, r2:true, o1 : true};
    _.pickRequired({r1: true, r2:true, o1 : true, wrong:false}, ['r1', 'r2'],['o1']);
    _.pickRequired({r1: true, r2:true, o1 : true}, ['r1', 'r2'],['o1']);
    expected = {o1: true, o2:true, o3 : true};
    _.pickRequired({o1: true, o2:true, o3 : true}, [], ['o1', 'o2', 'o3']);
});

Tinytest.add('Meteor Collection Management - underscore-extensions - deep', function(test) {
    var x = null;
    var result;
    result = _.deep(x, 'key1.0.1.key2');
    // result is null
    test.isUndefined(result);
    // make sure does not crash and the new deeply set object is returned
    x =_.deep(x, 'key1.0.1.key2', 'value');
    test.isNotNull(x);
    // test to make sure the middle things are arrays
    result = _.deep(x, 'key2.0', 'value');
    test.isNotNull(x);

    var complexKeyResult = _.deep(x, ['key1', '0.1', 'key2']);
    test.equal(complexKeyResult, 'value');
});

Tinytest.add('Meteor Collection Management - underscore-extensions - flattenObj', function(test) {
    var flatten = _.flattenObj({k:{l:{f:{m:1}}}});
    test.equal(Object.keys(flatten)[0], "k.l.f.m");
});


