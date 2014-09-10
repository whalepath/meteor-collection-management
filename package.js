Package.describe({
    summary: "Meteor Collection Management",
    version: "1.0.11",
    git: "https://github.com/whalepath/meteor-collection-management.git"
});

Package.onUse(function (api) {
    api.use('ejson', ['client', 'server']);
    api.use('underscore', ['client', 'server']);
    api.use('iron:router', ['client']);
    api.use('templating', ['client']);

    api.export('DbObjectType');
    api.export('ManagerType');
    api.export('Enums');
    api.export('one');
    api.export('many');

    api.addFiles('lib/underscoreExtensions.js', ['client', 'server']);
    api.addFiles('lib/enums.js', ['client', 'server']);
    api.addFiles('lib/dbobject.js', ['client', 'server']);
    api.addFiles('lib/manager.js', ['client', 'server']);
    api.addFiles('client/phantomjsCompat.js', 'client');
    api.addFiles('client/ironRouterExtensions.js', ['client']);
    api.addFiles('client/manager.js', ['client' ]);
    api.addFiles('server/manager.js', 'server');
});

Package.onTest(function (api) {
    api.use(['meteor-collection-management', 'tinytest', 'test-helpers']);
    api.addFiles('tests/dbobject-test.js', ['client', 'server']);
    api.addFiles('tests/enums-test.js', ['client', 'server']);
});
