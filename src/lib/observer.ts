import Pheme from '@pheme-kit/core';
import WrappedBlock from '@pheme-kit/core/lib/wrapped-block';

import EventEmitter from 'events';
import PQueue from 'p-queue';
import lodash from 'lodash';
import * as ethers from 'ethers';

export interface HandleState {
  owner: string;
  profile: string;
  chain: WrappedBlock[];
}

export interface State {
  [handle: string]: HandleState;
}

export default class Observer extends EventEmitter {
  public get provider() {
    return this.pheme.registry.contract.provider;
  }

  public static events = {
    newHandle: 'newHandle',
    newOwner: 'newOwner',
    newPost: 'newPost',
    ready: 'ready',
    unpublishPost: 'unpublishPost',
    updatePost: 'updatePost',
    updateProfile: 'updateProfile',
  };

  public static async create(pheme: Pheme) {
    const instance = new Observer(pheme);
    await instance.refresh();
    return instance;
  }

  public readonly pheme: Pheme;

  public state: State;

  public constructor(pheme: Pheme) {
    super();
    this.pheme = pheme;
  }

  public async refresh() {
    this.pheme.registry.contract.removeListener('RecordUpdated', this.handleRecordUpdate);
    this.pheme.registry.contract.removeListener('RecordAdded', this.handleRecordAdd);

    this.state = await this.loadState();

    this.pheme.registry.contract.on('RecordUpdated', this.handleRecordUpdate);
    this.pheme.registry.contract.on('RecordAdded', this.handleRecordAdd);

    this.emit(Observer.events.ready);
  }

  public stop() {
    this.pheme.registry.contract.removeListener('RecordUpdated', this.handleRecordUpdate);
    this.pheme.registry.contract.removeListener('RecordAdded', this.handleRecordAdd);
    this.removeAllListeners();
  }

  public async loadHandleState(handle: string): Promise<HandleState> {
    const { registry } = this.pheme;

    const [owner, profile, chain] = await Promise.all([
      registry.getOwner(handle).execute(),
      registry.getProfile(handle).execute(),
      this.pheme.loadHandle(handle).execute(),
    ]);

    return { owner, profile, chain };
  }

  public async loadState(): Promise<State> {
    const queue = new PQueue({ concurrency: 4 });
    const { registry } = this.pheme;
    const handleCount = await registry.getHandleCount().execute();
    const state: State = {};

    for (let i = 0; i < handleCount; i += 1) {
      queue.add(async () => {
        const handle = await registry.getHandleAt(i).execute();
        state[handle] = await this.loadHandleState(handle);
      });
    }

    queue.start();
    await queue.onIdle();
    queue.pause();
    return state;
  }

  private handleRecordAdd = async (encodedHandle: string) => {
    const handle = ethers.utils.parseBytes32String(encodedHandle);
    const newState = await this.loadHandleState(handle);

    this.state[handle] = newState;
    this.emit(Observer.events.newHandle, handle);
  };

  private handleRecordUpdate = async (
    encodedHandle: string,
    key: 'pointer' | 'profile' | 'owner'
  ) => {
    const handle = ethers.utils.parseBytes32String(encodedHandle);
    const newState = await this.loadHandleState(handle);
    const oldState = this.state[handle];

    this.state[handle] = newState;

    switch (key) {
      case 'profile':
        this.emit(Observer.events.updateProfile, handle);
        break;
      case 'owner':
        this.emit(Observer.events.newOwner, handle);
        break;
      case 'pointer': {
        const newPostWrappers = lodash.differenceBy(
          newState.chain,
          oldState.chain,
          (wrapper: WrappedBlock) => wrapper.block.uuid
        );
        newPostWrappers.forEach(wrapper =>
          this.emit(Observer.events.newPost, handle, wrapper.block.uuid)
        );

        const removedPostWrappers = lodash.differenceBy(
          oldState.chain,
          newState.chain,
          (wrapper: WrappedBlock) => wrapper.block.uuid
        );
        removedPostWrappers.forEach(wrapper =>
          this.emit(Observer.events.unpublishPost, handle, wrapper.block.uuid)
        );

        newState.chain.forEach(async wrapper => {
          const oldWrapper = oldState.chain.find(
            oldWrapper => oldWrapper.block.uuid === wrapper.block.uuid
          );

          if (!oldWrapper) return;

          // block has changed
          if (!lodash.isEqual(oldWrapper.block, wrapper.block)) {
            this.emit(Observer.events.updatePost, handle, wrapper.block.uuid);
          } else if (oldWrapper.contentAddress !== wrapper.contentAddress) {
            // check if content has changed
            const [oldContentHash, newContentHash] = await Promise.all([
              this.pheme.storage.writer.block.stat(oldWrapper.contentAddress),
              this.pheme.storage.writer.block.stat(wrapper.contentAddress),
            ]);

            if (oldContentHash !== newContentHash) {
              this.emit(Observer.events.updatePost, handle, wrapper.block.uuid);
            }
          }
        });
        break;
      }
      default:
        break;
    }
  };
}
