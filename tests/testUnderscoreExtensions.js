function test1() {
    try {
        _.onlyKeysCheck({r1: true, r2:true, o1 : true, wrong:false}, ['r1', 'r2'],['o1']);
    } catch(e) {
        // good
    }
};
function test2() {
    _.onlyKeysCheck({r1: true, r2:true}, ['r1', 'r2']);
    _.onlyKeysCheck({r1: true, r2:true}, ['r1', 'r2'], void 0);
    _.onlyKeysCheck({r1: true, r2:true, o1 : true}, ['r1', 'r2'],['o1']);
    _.onlyKeysCheck({o1: true, o2:true, o3 : true}, [], ['o1', 'o2', 'o3']);
};

function test3() {
    var expected;
    expected = {r1: true, r2:true};
    _.pickRequired({r1: true, r2:true}, ['r1', 'r2']);
    expected = {r1: true, r2:true, o1 : true};
    _.pickRequired({r1: true, r2:true, o1 : true, wrong:false}, ['r1', 'r2'],['o1']);
    _.pickRequired({r1: true, r2:true, o1 : true}, ['r1', 'r2'],['o1']);
    expected = {o1: true, o2:true, o3 : true};
    _.pickRequired({o1: true, o2:true, o3 : true}, [], ['o1', 'o2', 'o3']);
}



