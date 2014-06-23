Package.describe({
  summary: "Collection management to the database"
});

Package.on_use(function(api) {
  api.use('underscore', ['client', 'server']);

  api.export('DbObjectType');
  api.export('ManagerType');
  api.export('Enums');

  api.add_files('lib/underscoreExtensions.js', ['client', 'server']);
  api.add_files('lib/enums.js', ['client', 'server']);
  api.add_files('lib/dbobject.js', ['client', 'server']);
  api.add_files('lib/manager.js', ['client', 'server']);
  api.add_files('client/manager.js', ['client' ]);
  api.add_files('server/manager.js', 'server');
});

Package.on_test(function(api) {
    Npm.depends({
      mongodb: "1.4.1"
    });
    api.use(['meteor-collection-management', 'tinytest', 'test-helpers']);
    api.add_files('tests/dbobject-test.js', ['client', 'server']);
    api.add_files('tests/enums-test.js', ['client', 'server']);
})
