import { expect } from 'chai';
import * as Logger from 'bunyan';

import * as ethers from 'ethers';
import Pheme from '@pheme-kit/core';
import PhemeRegistry from '@pheme-kit/core/lib/registry';
import PhemeStorageIPFS from '@pheme-kit/storage-ipfs';

import createIPFSController from 'src/utils/create-ipfs-controller';
import PhemeAtlas from '../src/lib/atlas';
import { AtlasConfig } from '../src/lib/types';

declare var artifacts: any; // eslint-disable-line
declare var contract: (name: string, callback: (accounts: string[]) => any) => any; // eslint-disable-line

contract('Atlas e2e test', () => {
  const Registry: any = artifacts.require('RegistryV1');

  let atlas: PhemeAtlas;
  let logger: Logger;
  let config: AtlasConfig;
  let pheme: Pheme<PhemeRegistry>;

  const logBuffer = new Logger.RingBuffer({ limit: 100 });

  before(async () => {
    const registryContract = await Registry.deployed();
    const registryAddress = registryContract.address;
    const { host: providerUrl } = Registry.web3.currentProvider;

    // build a diposable temp IPFS server for testing purposes
    const ipfsServer = await createIPFSController({ disposable: true });

    const rpcUrl = `http://${ipfsServer.api.apiHost}:${ipfsServer.api.apiPort}`;
    const gatewayUrl = `http://${ipfsServer.api.gatewayHost}:${ipfsServer.api.gatewayPort}`;

    config = {
      ipfs: {
        rpcUrl,
        gatewayUrl,
      },
      ethereum: {
        provider: providerUrl,
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

    const provider = new ethers.providers.Web3Provider(Registry.web3.currentProvider);
    pheme = new Pheme(PhemeRegistry.attach(registryAddress, provider.getSigner()), {
      ipfs: new PhemeStorageIPFS(rpcUrl, gatewayUrl),
    });
  });

  const findLog = (lookup: (record: any) => boolean) => logBuffer.records.find(lookup);
  const waitUntil = (poller: () => Promise<boolean> | boolean, interval = 250) =>
    new Promise(resolve => {
      const handler = async () => {
        if (await poller()) {
          resolve();
        } else {
          setTimeout(handler, interval);
        }
      };

      handler();
    });

  const buildPostParams = (post: {
    article: string;
    date: string;
    title: string;
    type: string;
  }) => ({
    data: Buffer.from(JSON.stringify(post)),
    meta: { date: post.date, title: post.title, type: post.type },
  });

  it('should boot', async () => {
    atlas = await PhemeAtlas.create(config, logger);
    expect(findLog(record => record.state === 'ready')).to.be.an('object');
  });

  it('start listening', async () => {
    atlas.startListening();

    await pheme.registry.register('test').execute();
    await waitUntil(() =>
      findLog(({ process, state }) => process === 'job:pinNewHandle' && state === 'end')
    );

    // TODO: test with profile images
    await pheme.updateHandleProfile('test', { description: 'hello world' }).execute();
    await waitUntil(() =>
      findLog(({ process, state }) => process === 'job:pinUpdatedHandle' && state === 'end')
    );
    // TODO: push profile address to pinList

    // TODO: test with cover image
    const post = {
      article: '# HELLO WORLD',
      date: '2019-04-19T09:43:18+00:00',
      title: 'HELLO WORLD',
      type: 'text/markdown',
    };
    const postParams = buildPostParams(post);
    const [_address, { uuid }] = await pheme
      .pushToHandle('test', postParams.data, postParams.meta)
      .execute();
    await waitUntil(() =>
      findLog(({ process, state }) => process === 'job:pinNewPost' && state === 'end')
    );
    // TODO: push post address to pinList

    const updatedPost = {
      title: 'HELLO WORLD (updated)',
      ...post,
    };
    const updatedParams = buildPostParams(updatedPost);
    await pheme.replaceFromHandle('test', uuid, updatedParams.data, updatedParams.meta).execute();
    await waitUntil(() =>
      findLog(({ process, state }) => process === 'job:pinUpdatedPost' && state === 'end')
    );
    // TODO: push post address to pinList

    const storage = pheme.storage.getStorage() as PhemeStorageIPFS;
    const { ipfs } = storage;
    const pinnedItems = await ipfs.pin.ls();

    expect(pinnedItems).to.have.lengthOf(14);
    // TODO: compare pinned items to pinList
  });
});
