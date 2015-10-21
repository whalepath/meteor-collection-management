var packageName = 'patmoore:meteor-collection-management';
//var packageName = 'meteor-collection-management';

var  mongo = 'mongo@1.1.2';
var underscore = 'underscore@1.0.4';
var ejson = 'ejson@1.0.7';
Package.describe({
    name: packageName,
    summary: "Meteor Collection Management",
    version: "1.9.2",
    git: "https://github.com/patmoore/meteor-collection-management.git"
});

Package.onUse(function (api) {
    api.use(ejson, ['client', 'server']);
    api.use(underscore, ['client', 'server']);
    api.use(mongo, ['client', 'server']);

    api.export('DbObjectType');
    api.export('ManagerType');
    api.export('Enums');
    api.export('one');
    api.export('many');
    api.export('count');
    api.export('IronRouterExtension');

    api.addFiles('lib/internalutils.js', ['client', 'server']);
    api.addFiles('lib/underscoreExtensions.js', ['client', 'server']);
    api.addFiles('lib/enums.js', ['client', 'server']);
    api.addFiles('lib/dbobject.js', ['client', 'server']);
    api.addFiles('lib/manager.js', ['client', 'server']);
    api.addFiles('client/ironRouterExtensions.js', ['client']);
    api.addFiles('client/manager.js', ['client' ]);
    api.addFiles('server/manager.js', 'server');
});

Package.onTest(function (api) {
    api.use([packageName, 'tinytest', 'test-helpers']);
    api.use(underscore, ['client', 'server']);
    api.use(mongo, ['client', 'server']);
    api.addFiles('tests/dbobject-test.js', ['client', 'server']);
    api.addFiles('tests/enums-test.js', ['client', 'server']);
    api.addFiles('tests/manager-test.js', ['client', 'server']);
    api.addFiles('tests/testUnderscoreExtensions.js', ['client', 'server']);
});
