import * as path from 'path';
import * as fs from 'fs';
import * as ethers from 'ethers';
import PQueue from 'p-queue';
import { v4 as generateUUID } from 'uuid';

// import * as path from 'path';
// import * as fs from 'fs';
import moment from 'moment';
import tmp from 'tmp';
import { Storage as CloudStorage } from '@google-cloud/storage';

import Observer, { State } from '../observer';

import Pheme, { IBlock } from '@pheme-kit/core';
import PhemeRegistry from '@pheme-kit/core/lib/registry';
import PhemeStorageIPFS, { hashFromUrl } from '@pheme-kit/storage-ipfs';

import * as Logger from 'bunyan';

import {
  ExternalAtlasIPFSConfig,
  EmbeddedAtlasIPFSConfig,
  AtlasConfig,
  AtlasIPFSEndpoints,
} from '../types';

import createIPFS from '../create-ipfs';
import createPheme from '../create-pheme';

import { pinPost, pinHandle, pinState, archiveState, ipfsHealthcheck } from '../jobs';

// import schedule from 'node-schedule';

class PhemeAtlas {
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
    const pheme = await createPheme({ config, ipfs, logger });

    return new PhemeAtlas({ logger, ipfs, pheme });
  }

  public readonly jobQueue = new PQueue({ concurrency: 2 });
  public readonly logger: Logger;
  public readonly ipfs: AtlasIPFSEndpoints;
  public readonly pheme: Pheme<PhemeRegistry>;

  private constructor({
    pheme,
    logger,
    ipfs,
  }: {
    logger: Logger;
    ipfs: AtlasIPFSEndpoints;
    pheme: Pheme<PhemeRegistry>;
  }) {
    this.logger = logger;
    this.ipfs = ipfs;
    this.pheme = pheme;
  }

  public queue(jobName: string, ...params: any[]) {
    switch (jobName) {
      case 'initialPinState':
      case 'refreshPinState':
        break;
      case 'pinNewHandle':
      case 'pinUpdatedHandle':
        break;
      case 'pinNewPost':
      case 'pinUpdatedPost':
        break;
      case 'ipfsHealthcheck':
        break;
      case 'refresh':
        break;
      case 'refreshArchiveState':
        break;
    }
  }
}

export async function run(logger: Logger, config: AtlasConfig) {
  const atlas = await PhemeAtlas.create(config, logger);

  const ipfs = await createIPFS({ config, logger });
  const pheme = await createPheme({ config, ipfs, logger });
  const queue = new PQueue({ concurrency: 2 });

  const queueJob = (name: string, job: (Logger) => any) => {
    const jobId = generateUUID();
    const jobLogger = logger.child({ process: `job:${name}`, jobId });

    jobLogger.info({ state: 'queued' });
    queue.add(async () => {
      try {
        jobLogger.info({ state: 'begin' });
        await job(jobLogger);
        jobLogger.info({ state: 'end' });
      } catch (e) {
        jobLogger.info({ state: 'failed' });
      }
    });
  };

  const observer = await Observer.create(pheme);
  logger.info({ state: 'ready' }, 'Atlas is ready');

  const start = () => {
    // schedule.scheduleJob('*/15 * * * *', () => {
    //    queueJob('ipfsHealthcheck', async jobLogger => {
    //      ipfsHealthcheck({ pheme, logger: jobLogger });
    //    });
    // })

    queueJob('intialPinState', jobLogger => {
      pinState({ pheme, logger: jobLogger, state: observer.state });
    });

    // schedule.scheduleJob('0 0 */1 * *', () =>
    //   queueJob('refresh', async jobLogger => {
    //     queue.pause();
    //     try {
    //       await listener.refresh();
    //       const context = { pheme, logger: jobLogger, state: listener.state };

    //       queueJob('refreshPinState', () => pinState(context));
    //       queueJob('refreshArchiveState', () => archiveState(context));
    //     } catch (e) {
    //     } finally {
    //       queue.start();
    //     }
    //   })
    // );

    // Pin relevant content with each update
    observer.on(Observer.events.newHandle, handle =>
      queueJob('pinNewHandle', jobLogger => {
        pinHandle({ pheme, logger: jobLogger, state: observer.state, handle });
      })
    );

    observer.on(Observer.events.updateProfile, handle =>
      queueJob('pinUpdatedHandle', jobLogger => {
        // pin handle
        pinHandle({ pheme, logger: jobLogger, state: observer.state, handle });
      })
    );

    observer.on(Observer.events.newPost, (handle, uuid) =>
      queueJob('pinNewPost', jobLogger => {
        // pin post
        pinPost({ pheme, logger: jobLogger, state: observer.state, handle, uuid });
      })
    );

    observer.on(Observer.events.updatePost, (handle, uuid) =>
      queueJob('pinUpdatedPost', jobLogger => {
        // pin post
        pinPost({ pheme, logger: jobLogger, state: observer.state, handle, uuid });
      })
    );
  };

  return { pheme, ipfs, logger, observer, start, queue };
}
