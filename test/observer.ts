import { expect } from 'chai';
import Pheme from '@pheme-kit/core';
import IPFSFactory from 'ipfsd-ctl';

import TestRegistry from '../src/test/test-registry';
import Storage from '@pheme-kit/core/lib/storage';

import Observer from '../src/lib/observer';

describe('observer', function() {
  this.timeout(60 * 1000);

  let shouldTrigger: (action: () => any, eventName: string) => Promise<any>;

  let observer: Observer;
  let registry: TestRegistry;
  let storage: Storage;
  let ipfsServer: any;

  afterEach(async () => {
    if (!!ipfsServer) await ipfsServer.stop();
  });

  beforeEach(async () => {
    // build a diposable temp IPFS server for testing purposes
    ipfsServer = await IPFSFactory.create().spawn();

    storage = new Storage(
      `http://${ipfsServer.api.apiHost}:${ipfsServer.api.apiPort}`,
      `http://${ipfsServer.api.gatewayHost}:${ipfsServer.api.gatewayPort}`
    );

    registry = new TestRegistry();

    const pheme = new Pheme(registry as any, storage as any);
    observer = await Observer.create(pheme);

    shouldTrigger = (trigger, event) =>
      new Promise(resolve => {
        observer.once(event, (...args) => resolve(args));
        trigger();
      });
  });

  it('should listen for new handles', async () => {
    const [handle] = await shouldTrigger(() => {
      observer.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    expect(handle).to.equal('test');
  });

  it('should listen for profile updates', async () => {
    await shouldTrigger(() => {
      observer.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle] = await shouldTrigger(() => {
      observer.pheme.updateHandleProfile('test', { test: 'profile' }).execute();
    }, Observer.events.updateProfile);

    expect(handle).to.equal('test');
  });

  it('should listen for owner changes', async () => {
    await shouldTrigger(() => {
      observer.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle] = await shouldTrigger(() => {
      observer.pheme.registry.setOwner('test', 'NEW_USER').execute();
    }, Observer.events.newOwner);

    expect(handle).to.equal('test');
  });

  it('should listen for new posts', async () => {
    await shouldTrigger(() => {
      observer.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle, uuid] = await shouldTrigger(() => {
      const content = Buffer.from(JSON.stringify({ content: 'NEW_CONTENT' }));
      observer.pheme.pushToHandle('test', { path: 'content.json', content }).execute();
    }, Observer.events.newPost);

    expect(handle).to.equal('test');
    expect(uuid).to.be.a('string');
  });

  it('should listen for unpublished posts', async () => {
    await shouldTrigger(() => {
      observer.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle, uuid] = await shouldTrigger(() => {
      const content = Buffer.from(JSON.stringify({ content: 'NEW_CONTENT' }));
      observer.pheme.pushToHandle('test', { path: 'content.json', content }).execute();
    }, Observer.events.newPost);

    const [unpublishedHandle, unpublishedUuid] = await shouldTrigger(() => {
      observer.pheme.removeFromHandle(handle, uuid).execute();
    }, Observer.events.unpublishPost);

    expect(unpublishedHandle).to.equal(handle);
    expect(unpublishedUuid).to.equal(uuid);
  });

  it('should listen for updated posts', async () => {
    await shouldTrigger(() => {
      observer.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle, uuid] = await shouldTrigger(() => {
      const content = Buffer.from(JSON.stringify({ content: 'NEW_CONTENT' }));
      observer.pheme.pushToHandle('test', { path: 'content.json', content }).execute();
    }, Observer.events.newPost);

    const [updatedHandle, updatedUuid] = await shouldTrigger(() => {
      const content = Buffer.from(JSON.stringify({ content: 'UPDATED_CONTENT' }));
      observer.pheme.replaceFromHandle(handle, uuid, { path: 'content.json', content }).execute();
    }, Observer.events.updatePost);

    expect(updatedHandle).to.equal(handle);
    expect(updatedUuid).to.equal(uuid);
  });
});
