import Pheme from '@pheme-kit/core';
import PhemeRegistry from '@pheme-kit/core/lib/registry';

import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';
import * as ethers from 'ethers';
import * as Logger from 'bunyan';

import { run } from '../src/lib/atlas';
import { AtlasConfig } from '../src/lib/types';

let artifacts: any;
let contract: (name: string, callback: (accounts: string[]) => any) => any;

type ThenArg<T> = T extends Promise<infer U>
  ? U
  : T extends (...args: any[]) => Promise<infer U>
  ? U
  : T;

type Atlas = ThenArg<ReturnType<typeof run>>;

contract('Atlas e2e test', accounts => {
  const Registry: any = artifacts.require('RegistryV1');

  let server: any;
  let atlas: Atlas;
  let logger: Logger;
  let config: AtlasConfig;

  const logBuffer = new Logger.RingBuffer({ limit: 100 });

  before(async () => {
    const registryContract = await Registry.deployed();
    const registryAddress = registryContract.address;

    // const port = '9999';
    // server = Ganache.server();
    // await util.promisify(server.listen)(port);
    const { host: provider } = Registry.web3.currentProvider;

    // process.env.NODE_ENV = 'test';
    // process.env.ETHEREUM_NODE_URL = serverUrl;

    // const { default: migration } = require('../../../scripts/migrate');
    // await migration;

    // const state: any = require(statePath);
    // const provider = new ethers.providers.JsonRpcProvider(serverUrl);
    // const { chainId } = await provider.getNetwork();
    // console.log('ZZZZZ', chainId);
    // const { registryAddress } = state[`${chainId}`];

    config = {
      ipfs: { repositoryPath: '.ipfs' },
      ethereum: {
        provider,
        registryAddress,
      },
    };

    // // setup the config for the runner
    // process.env.CONFIG = JSON.stringify({
    //   ipfs: { repositoryPath: '.ipfs' },
    //   ethereum: {
    //     provider: process.env.ETHEREUM_NODE_URL,
    //     registryAddress,
    //   },
    // });

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

  // afterAll(async () => {
  //   atlas.observer.stop();

  //   await new Promise(resolve => {
  //     if (atlas.ipfs.server) {
  //       atlas.ipfs.server.killProcess(resolve);
  //     } else {
  //       resolve();
  //     }
  //   });

  //   await new Promise(resolve => {
  //     server.close(resolve);
  //   });

  //   await util
  //     .promisify(fs.unlink)(statePath)
  //     .catch();
  // });

  it('should boot', async () => {
    console.log('HELLO');
    atlas = await run(logger, config);
    //   atlas.queue.pause();
    //   expect(logBuffer.records.find(record => record.state === 'ready')).toBeDefined();
  });
});
