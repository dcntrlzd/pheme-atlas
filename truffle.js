require('ts-node').register();

const path = require('path');

module.exports = {
  development: {
    host: '127.0.0.1',
    port: 9999,
    network_id: '*',
  },
  test_file_extension_regexp: /.*\.[tj]s$/,
  contracts_build_directory: path.join(__dirname, 'artifacts'),
  contracts_directory: path.join(__dirname, 'contracts'),
  migrations_directory: path.join(__dirname, 'migrations'),
  compilers: {
    solc: {
      version: '0.4.25',
    },
  },
};
