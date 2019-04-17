const Storage = artifacts.require('RegistryStorage');

module.exports = function migration(deployer) {
  deployer.deploy(Storage);
};
