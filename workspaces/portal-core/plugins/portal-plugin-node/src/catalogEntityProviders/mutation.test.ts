import type { Entity } from '@backstage/catalog-model';
import { PortalCatalogEntityProviders } from './registry';
import type { CatalogEntityMutation, CatalogEntityProvider } from './types';

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { namespace: 'team-a', name: 'example' },
  spec: { details: { version: 'original' } },
};
const options = { entityRef: 'component:team-a/example' };
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

function fixture() {
  const lease = { held: true };
  const mutation: CatalogEntityMutation = {
    assertLockHeld() {
      if (!lease.held) throw new Error('Provider lock is not held');
    },
    registrationState: 'none',
    upsert: jest.fn(async (_entity: Entity) => undefined),
    remove: jest.fn(async () => undefined),
    clearRegistration: jest.fn(async () => undefined),
  };
  const implementation: CatalogEntityProvider = {
    isReady: () => true,
    async withEntityMutation(_options, operation) {
      try {
        return await operation(mutation);
      } finally {
        lease.held = false;
      }
    },
  };
  const register = (provider: CatalogEntityProvider = implementation) => {
    const registry = new PortalCatalogEntityProviders();
    registry.register({ id: 'example.provider', provider });
    return registry.get('example.provider');
  };
  return { lease, mutation, implementation, register };
}

describe('catalog mutation boundaries', () => {
  it.each([
    'component:team-a:extra/example',
    'component:team-a/example:extra',
    'component:team-a/example/extra',
    'compo-nent:team-a/example',
    'component:team_a/example',
    'component:team-a/example?',
    'component:team-a/example\n',
    'component:team-a\n/example',
    'component:teаm-a/example', // Cyrillic a is not part of the default catalog alphabet.
    'component:team-a/examplé',
    `component:team-a/${'a'.repeat(64)}`,
  ])('rejects malformed catalog lock keys: %s', async entityRef => {
    const f = fixture();
    const callback = jest.fn();
    await expect(
      f.register().withEntityMutation({ entityRef }, callback),
    ).rejects.toThrow('full kind:namespace/name');
    expect(callback).not.toHaveBeenCalled();
  });

  it('preserves mixed-case references using the catalog ASCII alphabet', async () => {
    const f = fixture();
    const implementation = f.implementation;
    const invoke = jest.spyOn(implementation, 'withEntityMutation');
    await f
      .register(implementation)
      .withEntityMutation(
        { entityRef: 'Component:Team-A/Example_1' },
        async mutation => {
          await mutation.upsert({
            ...entity,
            metadata: { namespace: 'Team-A', name: 'Example_1' },
          });
        },
      );
    expect(invoke).toHaveBeenCalledWith(
      { entityRef: 'component:team-a/example_1' },
      expect.any(Function),
    );
  });

  it('blocks microtask callback delivery after the provider has released its lease', async () => {
    const f = fixture();
    const deliveries: Promise<unknown>[] = [];
    const provider = f.register({
      isReady: () => true,
      async withEntityMutation(_input, callback) {
        try {
          queueMicrotask(() => {
            deliveries.push(callback(f.mutation));
          });
        } finally {
          f.lease.held = false;
        }
        return undefined as never;
      },
    });
    const consumer = jest.fn(async (mutation: CatalogEntityMutation) =>
      mutation.upsert(entity),
    );
    await expect(
      provider.withEntityMutation(options, consumer),
    ).rejects.toThrow('lock is not held');
    await Promise.allSettled(deliveries);
    expect(consumer).not.toHaveBeenCalled();
    expect(f.mutation.upsert).not.toHaveBeenCalled();
  });

  it('allows asynchronous lock acquisition before invoking the consumer', async () => {
    const f = fixture();
    f.lease.held = false;
    const acquired = deferred();
    const provider = f.register({
      isReady: () => true,
      async withEntityMutation(_input, callback) {
        await acquired.promise;
        f.lease.held = true;
        try {
          return await callback(f.mutation);
        } finally {
          f.lease.held = false;
        }
      },
    });
    const consumer = jest.fn(async (mutation: CatalogEntityMutation) =>
      mutation.upsert(entity),
    );
    const result = provider.withEntityMutation(options, consumer);
    expect(consumer).not.toHaveBeenCalled();
    acquired.resolve();
    await result;
    expect(consumer).toHaveBeenCalledTimes(1);
    expect(f.mutation.upsert).toHaveBeenCalledTimes(1);
  });

  it('refuses writes after lease loss during consumer authorization', async () => {
    const f = fixture();
    await expect(
      f.register().withEntityMutation(options, async mutation => {
        await Promise.resolve();
        f.lease.held = false;
        await mutation.upsert(entity);
      }),
    ).rejects.toThrow('lock is not held');
    expect(f.mutation.upsert).not.toHaveBeenCalled();
  });

  it('rechecks the provider lease before starting each accepted queued write', async () => {
    const f = fixture();
    jest.mocked(f.mutation.upsert).mockImplementation(async () => {
      f.lease.held = false;
    });
    await expect(
      f.register().withEntityMutation(options, async mutation => {
        void mutation.upsert(entity);
        void mutation.remove();
      }),
    ).rejects.toThrow('lock is not held');
    expect(f.mutation.upsert).toHaveBeenCalledTimes(1);
    expect(f.mutation.remove).not.toHaveBeenCalled();
  });

  it('claims the callback before a provider getter can synchronously reenter it', async () => {
    const f = fixture();
    let deliver!: (mutation: CatalogEntityMutation) => Promise<unknown>;
    let reentered = false;
    const deliveries: Promise<unknown>[] = [];
    Object.defineProperty(f.mutation, 'registrationState', {
      get() {
        if (!reentered) {
          reentered = true;
          deliveries.push(deliver(f.mutation));
        }
        return 'none';
      },
    });
    const provider = f.register({
      isReady: () => true,
      async withEntityMutation(_input, callback) {
        deliver = callback;
        return callback(f.mutation);
      },
    });
    const consumer = jest.fn(async () => 'result');
    await expect(
      provider.withEntityMutation(options, consumer),
    ).rejects.toThrow('twice');
    await Promise.allSettled(deliveries);
    expect(consumer).toHaveBeenCalledTimes(1);
  });

  it('snapshots the payload before it waits in the SDK write queue', async () => {
    const f = fixture();
    const draft = structuredClone(entity);
    await f.register().withEntityMutation(options, async mutation => {
      const write = mutation.upsert(draft);
      draft.metadata.name = 'different';
      await write;
    });
    expect(f.mutation.upsert).toHaveBeenCalledWith(entity);
  });

  it('does not expose the provider payload to caller mutations during provider awaits', async () => {
    const f = fixture();
    const entered = deferred();
    const release = deferred();
    const written: Entity[] = [];
    jest.mocked(f.mutation.upsert).mockImplementation(async payload => {
      entered.resolve();
      await release.promise;
      written.push(structuredClone(payload));
    });
    const draft = structuredClone(entity);
    const result = f
      .register()
      .withEntityMutation(options, mutation => mutation.upsert(draft));
    await entered.promise;
    draft.metadata.name = 'different';
    draft.spec = { details: { version: 'changed' } };
    release.resolve();
    await result;
    expect(written).toEqual([entity]);
  });
});
