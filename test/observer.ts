import { expect } from 'chai';
import Pheme from '@pheme-kit/core';

import TestRegistry from '../src/test/test-registry';
import TestStorage from '../src/test/test-storage';

import Observer from '../src/lib/observer';

describe('listener', () => {
  let shouldTrigger: (action: () => any, eventName: string) => Promise<any>;

  let listener: Observer;
  let registry: TestRegistry;
  let storage: TestStorage;

  beforeEach(async () => {
    storage = new TestStorage();
    registry = new TestRegistry();

    const pheme = new Pheme(registry as any, { test: storage });
    listener = await Observer.create(pheme);
    shouldTrigger = (trigger, event) =>
      new Promise(resolve => {
        listener.once(event, (...args) => resolve(args));
        trigger();
      });
  });

  it('should listen for new handles', async () => {
    const [handle] = await shouldTrigger(() => {
      listener.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    expect(handle).to.equal('test');
  });

  it('should listen for profile updates', async () => {
    await shouldTrigger(() => {
      listener.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle] = await shouldTrigger(() => {
      listener.pheme.updateHandleProfile('test', { test: 'profile' }).execute();
    }, Observer.events.updateProfile);

    expect(handle).to.equal('test');
  });

  it('should listen for owner changes', async () => {
    await shouldTrigger(() => {
      listener.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle] = await shouldTrigger(() => {
      listener.pheme.registry.setOwner('test', 'NEW_USER').execute();
    }, Observer.events.newOwner);

    expect(handle).to.equal('test');
  });

  it('should listen for new posts', async () => {
    await shouldTrigger(() => {
      listener.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle, uuid] = await shouldTrigger(() => {
      const content = Buffer.from(JSON.stringify({ content: 'NEW_CONTENT' }));
      listener.pheme.pushToHandle('test', content).execute();
    }, Observer.events.newPost);

    expect(handle).to.equal('test');
    expect(uuid).to.be.a('string');
  });

  it('should listen for unpublished posts', async () => {
    await shouldTrigger(() => {
      listener.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle, uuid] = await shouldTrigger(() => {
      const content = Buffer.from(JSON.stringify({ content: 'NEW_CONTENT' }));
      listener.pheme.pushToHandle('test', content).execute();
    }, Observer.events.newPost);

    const [unpublishedHandle, unpublishedUuid] = await shouldTrigger(() => {
      listener.pheme.removeFromHandle(handle, uuid).execute();
    }, Observer.events.unpublishPost);

    expect(unpublishedHandle).to.equal(handle);
    expect(unpublishedUuid).to.equal(uuid);
  });

  it('should listen for updated posts', async () => {
    await shouldTrigger(() => {
      listener.pheme.registerHandle('test').execute();
    }, Observer.events.newHandle);

    const [handle, uuid] = await shouldTrigger(() => {
      const content = Buffer.from(JSON.stringify({ content: 'NEW_CONTENT' }));
      listener.pheme.pushToHandle('test', content).execute();
    }, Observer.events.newPost);

    const [updatedHandle, updatedUuid] = await shouldTrigger(() => {
      const content = Buffer.from(JSON.stringify({ content: 'UPDATED_CONTENT' }));
      listener.pheme.replaceFromHandle(handle, uuid, content).execute();
    }, Observer.events.updatePost);

    expect(updatedHandle).to.equal(handle);
    expect(updatedUuid).to.equal(uuid);
  });
});
