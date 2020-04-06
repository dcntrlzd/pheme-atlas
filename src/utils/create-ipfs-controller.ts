/* eslint-disable  global-require */
import IPFSFactory from 'ipfsd-ctl';

const createIPFSController = (options: {} = {}) =>
  IPFSFactory.createController({
    ...options,
    ipfsHttpModule: require('ipfs-http-client'),
    ipfsBin: require('go-ipfs-dep').path(),
  });

export default createIPFSController;
