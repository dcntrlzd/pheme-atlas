import { createTask } from '@pheme-kit/core/lib/task';
import * as ethers from 'ethers';
import EventEmitter from 'events';

const mockTask = <T, M>(fn: (...fnArgs: any[]) => Promise<T>) => (...args: any[]) =>
  createTask<T>({ execute: () => fn(...args) });

export default class TestRegistry {
  private providerBlockNumber = 0;

  private emitter = new EventEmitter();

  public records: { [handle: string]: any } = {};

  public contract: any;

  public constructor() {
    this.contract = {
      provider: this.emitter,
      on: this.emitter.on.bind(this.emitter),
      removeListener: this.emitter.off.bind(this.emitter),
      once: this.emitter.once.bind(this.emitter),
    };
  }

  public register = mockTask(
    (handle: string): Promise<void> => {
      if (this.records[handle]) throw new Error('Handle already exists');
      this.records[handle] = {};
      this.tick('RecordAdded', handle);
      return Promise.resolve();
    }
  );

  public getPointer = mockTask(handle => Promise.resolve(this.query(handle, 'pointer')));

  public setPointer = mockTask((handle, value) =>
    Promise.resolve(this.update(handle, 'pointer', value))
  );

  public getOwner = mockTask(handle => Promise.resolve(this.query(handle, 'owner')));

  public setOwner = mockTask((handle, value) =>
    Promise.resolve(this.update(handle, 'owner', value))
  );

  public getProfile = mockTask(handle => Promise.resolve(this.query(handle, 'profile')));

  public setProfile = mockTask((handle, value) =>
    Promise.resolve(this.update(handle, 'profile', value))
  );

  public getHandleCount = mockTask(() => Promise.resolve(Object.keys(this.records).length));

  public getHandleAt = mockTask(i => Promise.resolve(Object.keys(this.records)[i]));

  public getLatestHandles = mockTask(limit => {
    const handles = Object.keys(this.records)
      .reverse()
      .splice(0, limit);
    return Promise.resolve(handles);
  });

  public getHandleByOwner = mockTask(owner =>
    Promise.resolve(Object.keys(this.records).find(handle => this.query(handle, 'owner') === owner))
  );

  public update(handle: string, key: string, value: any) {
    this.records[handle][key] = value;
    this.tick('RecordUpdated', handle, key);
  }

  public query(handle: string, key: string) {
    return this.records[handle][key];
  }

  private tick(eventName: string, handle: string, key?: string) {
    this.providerBlockNumber += 1;
    this.emitter.emit('block', this.providerBlockNumber);
    const encodedHandle = ethers.utils.formatBytes32String(handle);
    this.emitter.emit(eventName, encodedHandle, key);
  }
}
