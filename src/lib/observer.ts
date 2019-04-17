import Pheme, { IBlock } from '@pheme-kit/core';
import PhemeRegistry from '@pheme-kit/core/lib/registry';

import EventEmitter from 'events';
import PQueue from 'p-queue';
import lodash from 'lodash';
import * as ethers from 'ethers';

export interface HandleState {
  owner: string;
  pointer: string;
  profile: string;
  chain: IBlock[];
}

export interface State {
  [handle: string]: HandleState;
}

export default class Observer extends EventEmitter {
  get provider() {
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

  public static async create(pheme: Pheme<PhemeRegistry>) {
    const instance = new Observer(pheme);
    await instance.refresh();
    return instance;
  }

  public readonly pheme: Pheme<PhemeRegistry>;

  public state: State;

  private constructor(pheme: Pheme<PhemeRegistry>) {
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

    const [owner, profile, [pointer, chain]] = await Promise.all([
      registry.getOwner(handle).execute(),
      registry.getProfile(handle).execute(),
      this.pheme.loadHandle(handle).execute(),
    ]);

    return { owner, pointer, profile, chain };
  }

  public async loadState(): Promise<State> {
    const queue = new PQueue({ concurrency: 4 });
    const { registry } = this.pheme;
    const handleCount = await registry.getHandleCount().execute();
    const state = {} as State;

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
        const newPosts = lodash.differenceBy(newState.chain, oldState.chain, 'uuid');
        newPosts.forEach(post => this.emit(Observer.events.newPost, handle, post.uuid));

        const removedPosts = lodash.differenceBy(oldState.chain, newState.chain, 'uuid');
        removedPosts.forEach(post => this.emit(Observer.events.unpublishPost, handle, post.uuid));

        newState.chain.forEach(post => {
          const oldPost = oldState.chain.find(({ uuid }) => uuid === post.uuid);
          if (!oldPost) return;
          if (!lodash.isEqual(post, oldPost)) {
            this.emit(Observer.events.updatePost, handle, post.uuid);
          }
        });
        break;
      }
    }
  };
}
