//var packageName = 'patmoore:meteor-collection-management';
var packageName = 'meteor-collection-management';

Package.describe({
    name: packageName,
    summary: "Meteor Collection Management",
    version: "1.9.2",
    git: "https://github.com/whalepath/meteor-collection-management.git",
    documentation: 'README.md'
});

Package.onUse(function (api) {
    api.use('ejson@1.0.6', ['client', 'server']);
    api.use('underscore@1.0.3', ['client', 'server']);
    api.use('mongo@1.1.0', ['client', 'server']);

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
    api.addFiles('tests/dbobject-test.js', ['client', 'server']);
    api.addFiles('tests/enums-test.js', ['client', 'server']);
    api.addFiles('tests/manager-test.js', ['client', 'server']);
    api.addFiles('tests/testUnderscoreExtensions.js', ['client', 'server']);
});
