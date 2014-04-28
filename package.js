Package.describe({
  summary: "Collection management to the database"
});

Package.on_use(function(api) {
  //api.use('service-configuration', ['client', 'server']);

  //api.export('LinkedIn');

  api.add_files('lib/dbobject.js', ['client', 'server']);
  api.add_files('lib/manager.js', ['client', 'server']);
  api.add_files('client/manager.js', ['client' ]);
  api.add_files('server/manager.js', 'server');
});
