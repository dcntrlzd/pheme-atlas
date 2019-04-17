import { expect } from 'chai';
import * as Logger from 'bunyan';
import IPFSFactory from 'ipfsd-ctl';

import PhemeAtlas from '../src/lib/atlas';
import { AtlasConfig } from '../src/lib/types';

declare var artifacts: any; // eslint-disable-line
declare var contract: (name: string, callback: (accounts: string[]) => any) => any; // eslint-disable-line

contract('Atlas e2e test', () => {
  const Registry: any = artifacts.require('RegistryV1');

  let atlas: PhemeAtlas;
  let logger: Logger;
  let config: AtlasConfig;

  const logBuffer = new Logger.RingBuffer({ limit: 100 });

  before(async () => {
    const registryContract = await Registry.deployed();
    const registryAddress = registryContract.address;
    const { host: provider } = Registry.web3.currentProvider;

    // build a diposable temp IPFS server for testing purposes
    const ipfsServer: any = await new Promise((resolve, reject) =>
      IPFSFactory.create().spawn((err, ipfsd) => (err ? reject(err) : resolve(ipfsd)))
    );

    config = {
      ipfs: {
        rpcUrl: `http://${ipfsServer.api.apiHost}:${ipfsServer.api.apiPort}`,
        gatewayUrl: `http://${ipfsServer.api.gatewayHost}:${ipfsServer.api.gatewayPort}`,
      },
      ethereum: {
        provider,
        registryAddress,
      },
    };

    logger = Logger.createLogger({
      name: 'atlas',
      streams: [
        {
          type: 'raw',
          stream: logBuffer,
          level: 'debug',
        },
      ],
    });
  });

  it('should boot', async () => {
    atlas = await PhemeAtlas.create(config, logger);
    expect(logBuffer.records.find(record => record.state === 'ready')).to.be.an('object');
  });

  it('start listening', async () => {
    console.log(atlas);
  });
});
