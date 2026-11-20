import type { Entity } from '@backstage/catalog-model';
import { NotAllowedError } from '@backstage/errors';
import { PortalCatalogEntityProviders } from './registry';
import type {
  CatalogEntityMutation,
  CatalogEntityProvider,
  CatalogEntityRegistrationState,
} from './types';

/** Test implementation only: production providers must use durable locks/state. */
class TestCatalogEntityProvider implements CatalogEntityProvider {
  ready = true;
  failNextWrite = false;
  readonly entities = new Map<string, Entity>();
  readonly states = new Map<string, CatalogEntityRegistrationState>();
  readonly writes: string[] = [];
  private readonly locks = new Map<string, Promise<void>>();

  isReady(): boolean {
    return this.ready;
  }

  async withEntityMutation<T>(
    { entityRef }: { entityRef: string },
    operation: (mutation: CatalogEntityMutation) => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(entityRef);
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    this.locks.set(entityRef, current);
    await previous;
    const { states } = this;
    let held = true;
    const assertLockHeld = () => {
      if (!held) throw new Error('Provider lock is not held');
    };
    try {
      return await operation({
        assertLockHeld,
        get registrationState() {
          return states.get(entityRef) ?? 'none';
        },
        upsert: async entity => {
          assertLockHeld();
          this.states.set(entityRef, 'pending');
          if (this.failNextWrite) {
            this.failNextWrite = false;
            throw new Error('Write interrupted');
          }
          this.entities.set(entityRef, entity);
          this.states.set(entityRef, 'registered');
          this.writes.push(`upsert:${entityRef}`);
        },
        remove: async () => {
          assertLockHeld();
          this.entities.delete(entityRef);
          this.states.delete(entityRef);
          this.writes.push(`remove:${entityRef}`);
        },
        clearRegistration: async () => {
          assertLockHeld();
          this.states.delete(entityRef);
        },
      });
    } finally {
      held = false;
      release();
      if (this.locks.get(entityRef) === current) this.locks.delete(entityRef);
    }
  }
}

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { namespace: 'team-a', name: 'example' },
  spec: { type: 'service', lifecycle: 'experimental', owner: 'team-a' },
};
const options = { entityRef: 'component:team-a/example' };
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('catalog entity providers', () => {
  let registry: PortalCatalogEntityProviders;
  let implementation: TestCatalogEntityProvider;
  let provider: CatalogEntityProvider;
  beforeEach(() => {
    registry = new PortalCatalogEntityProviders();
    implementation = new TestCatalogEntityProvider();
    registry.register({ id: 'example.services', provider: implementation });
    provider = registry.get('example.services');
  });

  it('discovers independent providers for different entity kinds without sharing state', async () => {
    const other = new TestCatalogEntityProvider();
    registry.register({ id: 'another.resources', provider: other });
    await provider.withEntityMutation(options, mutation =>
      mutation.upsert(entity),
    );
    const resource = {
      ...entity,
      kind: 'Resource',
      metadata: { namespace: 'team-b', name: 'database' },
    };
    await registry
      .get('another.resources')
      .withEntityMutation({ entityRef: 'resource:team-b/database' }, mutation =>
        mutation.upsert(resource),
      );
    expect([...implementation.entities.keys()]).toEqual([options.entityRef]);
    expect([...other.entities.keys()]).toEqual(['resource:team-b/database']);
  });

  it('rejects duplicates rather than replacing the original provider', () => {
    expect(() =>
      registry.register({
        id: 'example.services',
        provider: new TestCatalogEntityProvider(),
      }),
    ).toThrow('Duplicate');
    expect(registry.get('example.services')).toBe(provider);
  });

  it.each(['services', 'example.', 'Example.services', ' example.services'])(
    'rejects invalid provider ID %s',
    id => {
      expect(() => registry.register({ id, provider: implementation })).toThrow(
        'namespaced',
      );
    },
  );

  it('fails clearly for missing or invalid providers', () => {
    expect(() => registry.get('absent.provider')).toThrow('not registered');
    expect(() =>
      registry.register({
        id: 'invalid.provider',
        provider: {} as CatalogEntityProvider,
      }),
    ).toThrow('Invalid');
  });

  it('checks readiness on every call, including previously resolved providers', async () => {
    implementation.ready = false;
    const operation = jest.fn();
    expect(provider.isReady()).toBe(false);
    await expect(
      provider.withEntityMutation(options, operation),
    ).rejects.toThrow('not ready');
    expect(operation).not.toHaveBeenCalled();
    implementation.ready = true;
    await provider.withEntityMutation(options, mutation =>
      mutation.upsert(entity),
    );
    expect(implementation.entities.size).toBe(1);
  });

  it.each(['example', 'component:example', 'team-a/example'])(
    'requires a full entity reference: %s',
    entityRef => {
      return expect(
        provider.withEntityMutation({ entityRef }, jest.fn()),
      ).rejects.toThrow('full kind:namespace/name');
    },
  );

  it('canonicalizes explicit kinds and namespaces without assuming default', async () => {
    await provider.withEntityMutation(
      { entityRef: 'Component:TEAM-A/EXAMPLE' },
      mutation => mutation.upsert(entity),
    );
    expect(implementation.entities.get(options.entityRef)).toEqual(entity);
  });

  it('refuses writes for an entity other than the locked reference', async () => {
    await expect(
      provider.withEntityMutation(options, mutation =>
        mutation.upsert({ ...entity, metadata: { name: 'other' } }),
      ),
    ).rejects.toThrow('does not match');
    expect(implementation.writes).toEqual([]);
  });

  it('lets the consumer authorize inside the lock without writing after denial', async () => {
    const credentials = { principal: 'caller' };
    const authorize = jest.fn().mockResolvedValue(false);
    await expect(
      provider.withEntityMutation(options, async mutation => {
        if (!(await authorize(credentials, mutation.registrationState)))
          throw new NotAllowedError('Denied');
        await mutation.upsert(entity);
      }),
    ).rejects.toThrow('Denied');
    expect(authorize).toHaveBeenCalledWith(credentials, 'none');
    expect(implementation.writes).toEqual([]);
  });

  it('preserves pending state after interruption for the next authorization check', async () => {
    implementation.failNextWrite = true;
    await expect(
      provider.withEntityMutation(options, mutation => mutation.upsert(entity)),
    ).rejects.toThrow('interrupted');
    await provider.withEntityMutation(options, async mutation => {
      expect(mutation.registrationState).toBe('pending');
      await mutation.upsert(entity);
      expect(mutation.registrationState).toBe('registered');
    });
  });

  it('keeps same-entity operations serialized by the provider lock', async () => {
    const entered = deferred();
    const release = deferred();
    const second = jest.fn(async (mutation: CatalogEntityMutation) =>
      mutation.remove(),
    );
    const first = provider.withEntityMutation(options, async mutation => {
      entered.resolve();
      await release.promise;
      await mutation.upsert(entity);
    });
    await entered.promise;
    const next = provider.withEntityMutation(options, second);
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([first, next]);
    expect(implementation.writes).toEqual([
      `upsert:${options.entityRef}`,
      `remove:${options.entityRef}`,
    ]);
  });

  it('expires mutation handles after either success or callback failure', async () => {
    let saved!: CatalogEntityMutation;
    await provider.withEntityMutation(options, async mutation => {
      saved = mutation;
    });
    await expect(saved.remove()).rejects.toThrow('has ended');
    expect(() => saved.registrationState).toThrow('has ended');
    await expect(
      provider.withEntityMutation(options, async mutation => {
        saved = mutation;
        throw new Error('Consumer failed');
      }),
    ).rejects.toThrow('Consumer failed');
    await expect(saved.upsert(entity)).rejects.toThrow('has ended');
    expect(implementation.writes).toEqual([]);
  });

  it('drains unawaited writes before releasing the mutation scope', async () => {
    const started = deferred();
    const release = deferred();
    const raw = implementation.withEntityMutation.bind(implementation);
    const slow: CatalogEntityProvider = {
      isReady: () => true,
      withEntityMutation: (input, operation) =>
        raw(input, mutation =>
          operation({
            ...mutation,
            upsert: async value => {
              started.resolve();
              await release.promise;
              await mutation.upsert(value);
            },
          }),
        ),
    };
    registry.register({ id: 'slow.provider', provider: slow });
    let finished = false;
    const result = registry
      .get('slow.provider')
      .withEntityMutation(options, async mutation => {
        void mutation.upsert(entity);
      })
      .then(() => {
        finished = true;
      });
    await started.promise;
    expect(finished).toBe(false);
    release.resolve();
    await result;
    expect(implementation.entities.get(options.entityRef)).toEqual(entity);
  });

  it('does not report success when an unawaited mutation fails', async () => {
    implementation.failNextWrite = true;
    await expect(
      provider.withEntityMutation(options, async mutation => {
        void mutation.upsert(entity);
      }),
    ).rejects.toThrow('interrupted');
  });

  it('checks readiness again after the consumer has awaited authorization', async () => {
    await expect(
      provider.withEntityMutation(options, async mutation => {
        implementation.ready = false;
        await mutation.remove();
      }),
    ).rejects.toThrow('not ready');
    expect(implementation.writes).toEqual([]);
  });

  it('does not confuse clearing bookkeeping with deleting another catalog source', async () => {
    await provider.withEntityMutation(options, mutation =>
      mutation.upsert(entity),
    );
    await provider.withEntityMutation(options, mutation =>
      mutation.clearRegistration(),
    );
    expect(implementation.states.has(options.entityRef)).toBe(false);
    expect(implementation.entities.has(options.entityRef)).toBe(true);
  });

  it('preserves callback results and never swallows consumer authorization failures', async () => {
    const raw = implementation.withEntityMutation.bind(implementation);
    registry.register({
      id: 'invalid.swallows',
      provider: {
        isReady: () => true,
        async withEntityMutation(input, operation) {
          try {
            return await raw(input, operation);
          } catch {
            return undefined as never;
          }
        },
      },
    });
    await expect(
      provider.withEntityMutation(options, async () => 'result'),
    ).resolves.toBe('result');
    await expect(
      registry.get('invalid.swallows').withEntityMutation(options, async () => {
        throw new NotAllowedError('Denied');
      }),
    ).rejects.toThrow('Denied');
    expect(implementation.writes).toEqual([]);
  });

  it('rejects a provider that skips the callback', async () => {
    registry.register({
      id: 'invalid.skips',
      provider: {
        isReady: () => true,
        withEntityMutation: async () => undefined as never,
      },
    });
    await expect(
      registry.get('invalid.skips').withEntityMutation(options, jest.fn()),
    ).rejects.toThrow('did not invoke');
  });

  it('never executes a callback delivered after the provider has already returned', async () => {
    let late!: (mutation: CatalogEntityMutation) => Promise<unknown>;
    registry.register({
      id: 'invalid.late',
      provider: {
        isReady: () => true,
        async withEntityMutation(_input, operation) {
          late = operation;
          return undefined as never;
        },
      },
    });
    const operation = jest.fn();
    await expect(
      registry.get('invalid.late').withEntityMutation(options, operation),
    ).rejects.toThrow('did not invoke');
    await expect(late({} as CatalogEntityMutation)).rejects.toThrow(
      'after returning',
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects repeated callbacks even if the provider catches the duplicate error', async () => {
    const raw = implementation.withEntityMutation.bind(implementation);
    registry.register({
      id: 'invalid.repeats',
      provider: {
        isReady: () => true,
        withEntityMutation: (input, operation) =>
          raw(input, async mutation => {
            const result = await operation(mutation);
            try {
              await operation(mutation);
            } catch {
              /* Deliberately invalid provider. */
            }
            return result;
          }),
      },
    });
    const operation = jest.fn(async () => 'result');
    await expect(
      registry.get('invalid.repeats').withEntityMutation(options, operation),
    ).rejects.toThrow('twice');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('waits for live work but rejects a provider that releases its callback early', async () => {
    const release = deferred();
    const entered = deferred();
    const raw = implementation.withEntityMutation.bind(implementation);
    registry.register({
      id: 'invalid.early',
      provider: {
        isReady: () => true,
        async withEntityMutation(input, operation) {
          void raw(input, operation).catch(() => undefined);
          return undefined as never;
        },
      },
    });
    const result = registry
      .get('invalid.early')
      .withEntityMutation(options, async mutation => {
        entered.resolve();
        await release.promise;
        await mutation.upsert(entity);
      });
    await entered.promise;
    let settled = false;
    result.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    // Let the SDK observe the provider's return while the consumer is blocked.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(settled).toBe(false);
    release.resolve();
    await expect(result).rejects.toThrow('before its mutation completed');
  });

  it('rejects unknown registration state before invoking consumer code', async () => {
    implementation.states.set(
      options.entityRef,
      'invalid' as CatalogEntityRegistrationState,
    );
    const operation = jest.fn();
    await expect(
      provider.withEntityMutation(options, operation),
    ).rejects.toThrow('Invalid catalog entity registration state');
    expect(operation).not.toHaveBeenCalled();
  });
});
