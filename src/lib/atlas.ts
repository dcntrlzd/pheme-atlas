import PQueue from 'p-queue';
import { v4 as generateUUID } from 'uuid';

import Pheme from '@pheme-kit/core';
import PhemeRegistry from '@pheme-kit/core/lib/registry';

import * as Logger from 'bunyan';
import schedule from 'node-schedule';
import Observer from './observer';

import { AtlasConfig, AtlasIPFSEndpoints } from './types';

import createIPFS from './create-ipfs';
import createPheme from './create-pheme';

import { pinPost, pinHandle, pinState, archiveState, ipfsHealthcheck } from './jobs';

export default class PhemeAtlas {
  public static validateConfig(config: any): AtlasConfig {
    if (!config.ipfs) throw new Error('config.ipfs not found');
    if (!config.ipfs.repositoryPath) {
      if (
        (config.ipfs.rpcUrl && !config.ipfs.gatewayUrl) ||
        (!config.ipfs.rpcUrl && config.ipfs.gatewayUrl)
      ) {
        throw new Error('config.ipfs must have rpcUrl and gatewayUrl');
      }
    }
    if (!config.ipfs.rpcUrl && !config.ipfs.gatewayUrl && !config.ipfs.repositoryPath) {
      throw new Error('config.ipfs must have either rpcUrl and gatewayUrl or repositoryPath');
    }

    if (!config.ethereum) throw new Error('config.ethereum not found');
    if (!config.ethereum.provider) throw new Error('config.ethereum.provider not found');
    if (!config.ethereum.registryAddress) {
      throw new Error('config.ethereum.registryAddress not found');
    }

    return config;
  }

  public static async create(config: AtlasConfig, logger: Logger) {
    PhemeAtlas.validateConfig(config);

    const ipfs = await createIPFS({ config, logger });
    const pheme = await createPheme({ config, ipfs });
    const observer = await Observer.create(pheme);

    logger.info({ state: 'ready' }, 'Atlas is ready');
    return new PhemeAtlas({ logger, ipfs, pheme, observer });
  }

  public readonly logger: Logger;

  public readonly ipfs: AtlasIPFSEndpoints;

  public readonly pheme: Pheme<PhemeRegistry>;

  public readonly observer: Observer;

  private constructor({
    pheme,
    logger,
    ipfs,
    observer,
  }: {
    logger: Logger;
    ipfs: AtlasIPFSEndpoints;
    pheme: Pheme<PhemeRegistry>;
    observer: Observer;
  }) {
    this.logger = logger;
    this.ipfs = ipfs;
    this.pheme = pheme;
    this.observer = observer;
  }
}

export async function run(logger: Logger, config: AtlasConfig) {
  const atlas = await PhemeAtlas.create(config, logger);

  const jobQueue = new PQueue({ concurrency: 2 });

  const queue = (name: string, job: (Atlas) => any) => {
    const jobId = generateUUID();
    const jobLogger = atlas.logger.child({ process: `job:${name}`, jobId });

    jobLogger.info({ state: 'queued' });
    jobQueue.add(async () => {
      try {
        jobLogger.info({ state: 'begin' });
        await job({ ...atlas, logger: jobLogger });
        jobLogger.info({ state: 'end' });
      } catch (e) {
        jobLogger.info({ state: 'failed' });
      }
    });
  };

  const start = () => {
    logger.info({ state: 'listening' }, 'Atlas is listening...');

    schedule.scheduleJob('*/15 * * * *', () => {
      queue('ipfsHealthcheck', context => ipfsHealthcheck({ context }));
    });

    queue('intialPinState', context => pinState({ context }));

    schedule.scheduleJob('0 0 */1 * *', () =>
      queue('refresh', async context => {
        jobQueue.pause();
        try {
          await context.observer.refresh();
          queue('refreshPinState', () => pinState({ context }));
          queue('refreshArchiveState', () => archiveState({ context }));
        } finally {
          jobQueue.pause();
        }
      })
    );

    // Pin relevant content with each update
    atlas.observer.on(Observer.events.newHandle, handle =>
      queue('pinNewHandle', context => pinHandle({ context, handle }))
    );

    atlas.observer.on(Observer.events.updateProfile, handle =>
      queue('pinUpdatedHandle', context => pinHandle({ context, handle }))
    );

    atlas.observer.on(Observer.events.newPost, (handle, uuid) =>
      queue('pinNewPost', context => pinPost({ context, handle, uuid }))
    );

    atlas.observer.on(Observer.events.updatePost, (handle, uuid) =>
      queue('pinUpdatedPost', context => pinPost({ context, handle, uuid }))
    );
  };

  return { atlas, start };
}
