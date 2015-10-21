Tinytest.add('Meteor Collection Management - manager - simple', function(test) {
    var calledMethods = {};
    var TestManagerType = ManagerType.create({
        callPrefix: 'testManager',
        meteorCallDefinitions: [
            'DoSomething_1',
            'DoSomething_2',
            {
                'DoSomething_3': {
                    permissionCheck: function () {
                        'DoSomething_3';
                        return true;
                    },
                    method: function () {
                        return 'DoSomething_3';
                    }
                }
            }
        ],
        meteorTopicDefinitions: {
            getSomething_1: {},
            'getSomething_2': function () {
                return 'getSomething_2';
            },
            'getSomething_3': {
                cursor: function () {
                    return 'getSomething_3';
                }
            }
        },
        extensions: {
            DoSomething_1: function () {
                return 'DoSomething_1';
            },
            DoSomething_2Method: function () {
                return 'DoSomething_2';
            },
            getSomething_1Cursor: function () {
                return 'getSomething_1';
            }
        }
    });
    Object.defineProperties(TestManagerType.prototype, {
        createMeteorCallMethod: {
            value: function (definition) {
                var fn = definition.method;
                var definitionName = definition.meteorCallNameSuffix;
                var thatManager = this.thatManager;
                test.equal(_.isFunction(fn), true, "no method:" + definitionName);
                var actual = fn.call(thatManager);
                calledMethods[actual] = true;
                test.equal(definitionName, actual, "Bad method definition");
            }
        },
        createPublication: {
            value: function (definition) {
                var fn = definition.cursor;
                var definitionName = definition.meteorTopicSuffix;
                var thatManager = this.thatManager;
                test.equal(_.isFunction(fn), true, "no cursor:" + definitionName);
                var actual = fn.call(thatManager);
                calledMethods[actual] = true;
                test.equal(definitionName, actual, "Bad cursor definition");
            }
        }
    });

    var TestManager = new TestManagerType();
    test.equal(_.keys(calledMethods).length, 6, "should have called 3 methods and 3 cursors but only called: "+ _.keys(calledMethods));
});