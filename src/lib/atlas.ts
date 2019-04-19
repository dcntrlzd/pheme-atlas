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

  public readonly jobQueue: PQueue;

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

    // TODO: Read concurrency from config
    this.jobQueue = new PQueue({ concurrency: 2 });
  }

  public queue = (name: string, job: (Atlas) => any) => {
    const jobId = generateUUID();
    const jobLogger = this.logger.child({ process: `job:${name}`, jobId });

    jobLogger.info({ state: 'queued' });
    this.jobQueue.add(async () => {
      try {
        jobLogger.info({ state: 'begin' });
        await job({ ...this, logger: jobLogger });
        jobLogger.info({ state: 'end' });
      } catch (e) {
        jobLogger.info({ state: 'failed' });
      }
    });
  };

  public scheduleJobs = () => {
    // TODO: check if already scheduled
    schedule.scheduleJob('*/15 * * * *', () => {
      this.queue('ipfsHealthcheck', context => ipfsHealthcheck({ context }));
    });

    schedule.scheduleJob('0 0 */1 * *', () =>
      this.queue('refresh', async context => {
        this.jobQueue.pause();
        try {
          await context.observer.refresh();
          await Promise.all([pinState({ context }), archiveState({ context })]);
        } finally {
          this.jobQueue.pause();
        }
      })
    );

    this.logger.info({ state: 'scheduled' }, 'Periodic jobs are scheduled');
  };

  public startListening = () => {
    // TODO: check if already listening
    this.observer.on(Observer.events.newHandle, handle =>
      this.queue('pinNewHandle', context => pinHandle({ context, handle }))
    );

    this.observer.on(Observer.events.updateProfile, handle =>
      this.queue('pinUpdatedHandle', context => pinHandle({ context, handle }))
    );

    this.observer.on(Observer.events.newPost, (handle, uuid) =>
      this.queue('pinNewPost', context => pinPost({ context, handle, uuid }))
    );

    this.observer.on(Observer.events.updatePost, (handle, uuid) =>
      this.queue('pinUpdatedPost', context => pinPost({ context, handle, uuid }))
    );

    this.logger.info({ state: 'listening' }, 'Event listeners are active.');
  };

  public start = () => {
    this.queue('intialPinState', context => pinState({ context }));
    this.startListening();
    this.scheduleJobs();
  };
}
