Package.describe({
    summary: "Meteor Collection Management",
    version: "1.4.7",
    git: "https://github.com/whalepath/meteor-collection-management.git"
});

Package.onUse(function (api) {
    api.use('ejson', ['client', 'server']);
    api.use('underscore', ['client', 'server']);
    api.use('iron:router', ['client']);
    api.use('templating', ['client']);
    api.use('mongo', ['client', 'server']);

    api.export('DbObjectType');
    api.export('ManagerType');
    api.export('Enums');
    api.export('one');
    api.export('many');
    api.export('count');

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
    // TO_PAT: not sure what this is about, but it breaks the test server
    //api.use(['patmoore:meteor-collection-management', 'tinytest', 'test-helpers']);
    api.use(['meteor-collection-management', 'tinytest', 'test-helpers']);
    api.addFiles('tests/dbobject-test.js', ['client', 'server']);
    api.addFiles('tests/enums-test.js', ['client', 'server']);
    api.addFiles('tests/manager-test.js', ['client', 'server']);
});
