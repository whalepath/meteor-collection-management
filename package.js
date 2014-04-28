Package.describe({
  summary: "Collection management to the database"
});

Package.on_use(function(api) {
  //api.use('service-configuration', ['client', 'server']);

  //api.export('LinkedIn');

  api.add_files(
    ['linkedin_configure.html', 'linkedin_configure.js'],
    'client');

  api.add_files('lib/dbobject.js', ['client', 'server']);
  api.add_files('linkedin_server.js', 'server');
  api.add_files('linkedin_client.js', 'client');
});
