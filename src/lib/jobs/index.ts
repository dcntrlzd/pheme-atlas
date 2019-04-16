import * as path from 'path';
import * as fs from 'fs';
import moment from 'moment';
import tmp from 'tmp';
import { Storage as CloudStorage } from '@google-cloud/storage';
import Pheme, { IBlock } from '@pheme-kit/core';
import PhemeRegistry from '@pheme-kit/core/lib/registry';
import PhemeStorageIPFS, { hashFromUrl } from '@pheme-kit/storage-ipfs';
import * as ethers from 'ethers';
import * as Logger from 'bunyan';
import { State } from '../observer';

interface PinOptions {
  pheme: Pheme<PhemeRegistry>;
  logger: Logger;
  timeout?: number;
}

export const pinFile = (address: string, { pheme, logger, timeout = 30000 }: PinOptions) =>
  new Promise(async resolve => {
    const { ipfs } = (pheme.storage as any).storageMap.ipfs as PhemeStorageIPFS;
    const hash = hashFromUrl(address);

    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      logger.error({ hashState: 'timedout', hash });
      resolve();
    }, timeout);

    const currentMatches = await ipfs.pin.ls(hash);
    if (currentMatches.length > 0) {
      logger.info({ hashState: 'exists', hash });
      clearTimeout(timeoutId);
      return resolve();
    }

    logger.info({ hashState: 'new', hash });

    ipfs.pin
      .add(hash)
      .catch(err => {
        logger.error({ hashState: 'failed', hash, err });
      })
      .then(() => {
        clearTimeout(timeoutId);
        if (!isTimedOut) resolve();
      });
  });

export const pinImage = (image: { [key: string]: string }, options: PinOptions): Promise<any> => {
  return Promise.all(
    Object.keys(image).map(key => {
      const version = image[key];
      if (!version) return;
      return pinFile(version, options);
    })
  );
};

export const pinPost = async ({
  pheme,
  logger,
  state,
  handle,
  uuid,
}: {
  pheme: Pheme<PhemeRegistry>;
  logger: Logger;
  state: State;
  handle: string;
  uuid: string;
}) => {
  const handleState = state[handle];
  if (!handleState) {
    logger.error({ postState: 'missing', handle });
    return;
  }

  const postIndex = handleState.chain.findIndex(block => block.uuid === uuid);
  const postPointer =
    postIndex > 0 ? handleState.chain[postIndex - 1].previous : handleState.pointer;
  const postState = postIndex >= 0 ? handleState.chain[postIndex] : undefined;

  if (!postState) {
    logger.error({ postState: 'missing', handle });
    return;
  }

  const options = { pheme, logger };

  return Promise.all([
    postPointer ? pinFile(postPointer, options) : null,
    postState.previous ? pinFile(postState.previous, options) : null,
    postState.address ? pinFile(postState.address, options) : null,
    postState.meta.coverImageUrl ? pinFile(postState.meta.coverImageUrl, options) : null,
    postState.meta.coverImage ? pinImage(postState.meta.coverImage, options) : null,
  ]);
};

export const pinHandle = async ({
  pheme,
  logger,
  state,
  handle,
}: {
  pheme: Pheme<PhemeRegistry>;
  logger: Logger;
  state: State;
  handle: string;
}) => {
  const handleState = state[handle];
  if (!handleState) {
    logger.error({ handleState: 'missing', handle });
    return;
  }

  const { profile } = handleState;
  const profileDetails: any = profile ? await pheme.storage.readObject(profile) : {};
  const { avatarUrl, avatar } = profileDetails;

  const options = { pheme, logger };

  return Promise.all([
    profile ? pinFile(profile, options) : null,
    avatarUrl ? pinFile(avatarUrl, options) : null,
    avatar ? pinImage(avatar, options) : null,
  ]);
};

export const pinState = async ({
  pheme,
  logger,
  state,
}: {
  pheme: Pheme<PhemeRegistry>;
  logger: Logger;
  state: State;
}) => {
  for (const handle of Object.keys(state)) {
    await pinHandle({ handle, state, pheme, logger });
    const { chain } = state[handle];
    for (const post of chain) {
      const { uuid } = post;
      await pinPost({ handle, state, pheme, logger, uuid });
    }
  }
};

export const archiveState = async ({
  pheme,
  logger,
  state,
}: {
  pheme: Pheme<PhemeRegistry>;
  logger: Logger;
  state: State;
}) => {
  const gcpBucketName = process.env.GCP_BUCKET_NAME;
  if (!gcpBucketName) return;

  const cloudStorage = new CloudStorage();
  const bucket = cloudStorage.bucket(gcpBucketName);
  await bucket.exists();

  const { chainId: networkId } = await pheme.registry.contract.provider.getNetwork();
  const snapshotId = `${networkId}/${moment()
    .utc()
    .format('YYYY-MM-DDTHH-mm')}`;

  const handleLog = tmp.fileSync();
  for (const handle of Object.keys(state)) {
    logger.info({ snapshotId, type: 'handle', handle });

    const handleState = state[handle];
    const { owner, chain } = handleState;
    const profile = handleState.profile ? await pheme.storage.readObject(handleState.profile) : {};

    fs.appendFileSync(handleLog.name, JSON.stringify({ handle, profile, owner }) + '\n');

    const postLog = tmp.fileSync();
    let { pointer } = handleState;
    for (const ring of chain) {
      const post = await pheme.storage.readObject(ring.address);

      logger.info({ snapshotId, type: 'post', handle, ring: ring.uuid });
      fs.appendFileSync(postLog.name, JSON.stringify({ pointer, handle, ring, post }) + '\n');
      pointer = ring.previous;
    }

    await bucket.upload(postLog.name, { destination: `${snapshotId}/posts/${handle}.json` });
    postLog.removeCallback();
  }

  await bucket.upload(handleLog.name, { destination: `${snapshotId}/handles.json` });
  handleLog.removeCallback();
};

export const ipfsHealthcheck = async ({
  pheme,
  logger,
  timeout = 5000,
}: {
  pheme: Pheme<PhemeRegistry>;
  logger: Logger;
  timeout?: number;
}) => {
  const { ipfs } = (pheme.storage as any).storageMap.ipfs as PhemeStorageIPFS;
  logger.info({ state: 'begin' });

  const timeoutId = setTimeout(() => {
    throw new Error(`IPFS healtcheck timed out after ${timeout}ms.`);
  }, timeout);

  const peers = await ipfs.swarm.peers();
  clearTimeout(timeoutId);
  if (!peers.length) throw new Error('No peers found, IPFS node might be disconnected.');
};
