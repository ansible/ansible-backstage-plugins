import { TestDatabases } from '@backstage/backend-test-utils';
import { createEERegistrationLock } from './EERegistrationLock';

const testDatabases = TestDatabases.create({ ids: ['SQLITE_3'] });

describe('createEERegistrationLock', () => {
  it('treats existing lock rows as pending during the registration state migration', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    await knex.schema.createTable('ee_registration_lock_leases', table => {
      table.string('entity_ref').primary();
      table.string('owner').nullable();
      table.bigInteger('lease_expires_at').notNullable().defaultTo(0);
      table.boolean('mutation_in_progress').notNullable().defaultTo(false);
    });
    await knex('ee_registration_lock_leases').insert({
      entity_ref: 'component:default/legacy-ee',
      owner: null,
      lease_expires_at: 0,
      mutation_in_progress: false,
    });

    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);
    await lock('component:default/legacy-ee', async lockContext => {
      expect(lockContext.registrationState).toBe('pending');
    });
    await knex.destroy();
  });

  it('preserves pending registration state across lock instances and clears it after deletion', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    const database = { getClient: async () => knex } as any;
    const lockA = createEERegistrationLock(database);
    const lockB = createEERegistrationLock(database);

    await expect(
      lockA('component:default/ee', async lock => {
        expect(lock.registrationState).toBe('none');
        await lock.beginRegistrationMutation();
        throw new Error('provider result is uncertain');
      }),
    ).rejects.toThrow('provider result is uncertain');

    await lockB('component:default/ee', async lock => {
      expect(lock.registrationState).toBe('pending');
      await lock.beginRegistrationMutation();
      await lock.completeRegistration();
    });

    await lockA('component:default/ee', async lock => {
      expect(lock.registrationState).toBe('registered');
      await lock.beginRegistrationMutation();
      await lock.clearRegistration();
    });

    await lockB('component:default/ee', async lock => {
      expect(lock.registrationState).toBe('none');
    });
    await knex.destroy();
  });

  it('serializes catalog reads and writes without holding a transaction', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    await knex.schema.createTable('catalog_entities', table => {
      table.string('entity_ref').primary();
    });
    await knex.schema.createTable('ee_registration_lock_leases', table => {
      table.string('entity_ref').primary();
      table.string('owner').nullable();
      table.bigInteger('lease_expires_at').notNullable().defaultTo(0);
    });
    const database = { getClient: async () => knex } as any;
    const lockA = createEERegistrationLock(database);
    const lockB = createEERegistrationLock(database);
    const applyMutation = jest.fn(async (entityRef: string) => {
      await knex('catalog_entities')
        .insert({ entity_ref: entityRef })
        .onConflict('entity_ref')
        .merge();
    });
    let signalFirstRead!: () => void;
    let releaseFirst!: () => void;
    const firstRead = new Promise<void>(resolve => {
      signalFirstRead = resolve;
    });
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const observations: boolean[] = [];

    const first = lockA(
      'component:default/ee',
      async ({ assertLockHeld, beginRegistrationMutation }) => {
        assertLockHeld();
        const existing = await knex('catalog_entities')
          .where({ entity_ref: 'component:default/ee' })
          .first();
        observations.push(Boolean(existing));
        signalFirstRead();
        await firstGate;
        assertLockHeld();
        await beginRegistrationMutation();
        await applyMutation('component:default/ee');
      },
    );

    await firstRead;
    let secondStarted = false;
    const second = lockB(
      'component:default/ee',
      async ({ assertLockHeld, beginRegistrationMutation }) => {
        secondStarted = true;
        assertLockHeld();
        const existing = await knex('catalog_entities')
          .where({ entity_ref: 'component:default/ee' })
          .first();
        observations.push(Boolean(existing));
        await beginRegistrationMutation();
        await applyMutation('component:default/ee');
      },
    );

    await new Promise(resolve => setTimeout(resolve, 25));
    expect(secondStarted).toBe(false);
    releaseFirst();
    await Promise.all([first, second]);

    expect(observations).toEqual([false, true]);
    expect(applyMutation).toHaveBeenCalledTimes(2);
    await expect(knex('catalog_entities')).resolves.toHaveLength(1);
    await knex.destroy();
  });

  it('does not reclaim an expired lease during a provider mutation', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    await knex.schema.createTable('catalog_entities', table => {
      table.string('entity_ref').primary();
    });
    const database = { getClient: async () => knex } as any;
    const lockA = createEERegistrationLock(database);
    const lockB = createEERegistrationLock(database);
    let signalMutationStarted!: () => void;
    let releaseMutation!: () => void;
    const mutationStarted = new Promise<void>(resolve => {
      signalMutationStarted = resolve;
    });
    const mutationGate = new Promise<void>(resolve => {
      releaseMutation = resolve;
    });
    let activeMutations = 0;
    let maxConcurrentMutations = 0;
    const applyMutation = jest.fn(async (entityRef: string) => {
      activeMutations += 1;
      maxConcurrentMutations = Math.max(
        maxConcurrentMutations,
        activeMutations,
      );
      try {
        if (applyMutation.mock.calls.length === 1) {
          signalMutationStarted();
          await mutationGate;
        }
        await knex('catalog_entities')
          .insert({ entity_ref: entityRef })
          .onConflict('entity_ref')
          .merge();
      } finally {
        activeMutations -= 1;
      }
    });
    const first = lockA('component:default/ee', async lock => {
      await lock.beginRegistrationMutation();
      await applyMutation('component:default/ee');
    });
    await mutationStarted;

    await knex('ee_registration_lock_leases')
      .where({ entity_ref: 'component:default/ee' })
      .update({ lease_expires_at: 0 });

    let secondStarted = false;
    const second = lockB('component:default/ee', async lock => {
      secondStarted = true;
      await lock.beginRegistrationMutation();
      await applyMutation('component:default/ee');
    });

    await new Promise(resolve => setTimeout(resolve, 125));
    expect(secondStarted).toBe(false);
    expect(activeMutations).toBe(1);
    expect(applyMutation).toHaveBeenCalledTimes(1);

    releaseMutation();
    await Promise.all([first, second]);

    expect(maxConcurrentMutations).toBe(1);
    expect(applyMutation).toHaveBeenCalledTimes(2);
    await knex.destroy();
  });

  it('releases the lock when the operation fails', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);

    await expect(
      lock('component:default/ee', async () => {
        throw new Error('provider mutation failed');
      }),
    ).rejects.toThrow('provider mutation failed');
    await expect(
      lock('component:default/ee', async () => 'registered'),
    ).resolves.toBe('registered');

    await knex.destroy();
  });

  it('clears schema readiness state and rethrows when schema initialization fails', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    // knex.schema is a getter that returns a fresh SchemaBuilder on every
    // access, so the builder's methods must be patched at the client level
    // to affect calls made from inside EERegistrationLock.
    const originalSchemaBuilder = knex.client.schemaBuilder.bind(knex.client);
    let callCount = 0;
    knex.client.schemaBuilder = () => {
      const builder = originalSchemaBuilder();
      const originalHasTable = builder.hasTable.bind(builder);
      builder.hasTable = (...args: unknown[]) => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.reject(new Error('schema check failed'));
        }
        return originalHasTable(...(args as [string]));
      };
      return builder;
    };
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);

    await expect(
      lock('component:default/ee', async () => 'unused'),
    ).rejects.toThrow('schema check failed');

    await expect(
      lock('component:default/ee', async () => 'registered'),
    ).resolves.toBe('registered');

    await knex.destroy();
  });

  it('tolerates another replica concurrently creating the lock table and its columns', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    const originalSchemaBuilder = knex.client.schemaBuilder.bind(knex.client);
    knex.client.schemaBuilder = () => {
      const builder = originalSchemaBuilder();
      const originalCreateTable = builder.createTable.bind(builder);
      const originalAlterTable = builder.alterTable.bind(builder);
      builder.createTable = async (...args: any[]) => {
        await originalCreateTable(...args);
        throw new Error('table already exists');
      };
      builder.alterTable = async (...args: any[]) => {
        await originalAlterTable(...args);
        throw new Error('column already exists');
      };
      return builder;
    };
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);

    await expect(
      lock('component:default/ee', async () => 'ok'),
    ).resolves.toBe('ok');

    await knex.destroy();
  });

  it('tolerates another replica concurrently adding the migrated lease columns', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    await knex.schema.createTable('ee_registration_lock_leases', table => {
      table.string('entity_ref').primary();
      table.string('owner').nullable();
      table.bigInteger('lease_expires_at').notNullable().defaultTo(0);
    });
    const originalSchemaBuilder = knex.client.schemaBuilder.bind(knex.client);
    knex.client.schemaBuilder = () => {
      const builder = originalSchemaBuilder();
      const originalAlterTable = builder.alterTable.bind(builder);
      builder.alterTable = async (...args: any[]) => {
        await originalAlterTable(...args);
        throw new Error('column already exists');
      };
      return builder;
    };
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);

    await expect(
      lock('component:default/ee', async () => 'ok'),
    ).resolves.toBe('ok');

    await knex.destroy();
  });

  it('marks the lease lost when a scheduled renewal fails with a database error', async () => {
    jest.useFakeTimers();
    const knex = await testDatabases.init('SQLITE_3');
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);

    try {
      const operation = lock('component:default/ee', async lockContext => {
        await knex.raw(`
          CREATE TRIGGER fail_ee_lock_renewal
          BEFORE UPDATE ON ee_registration_lock_leases
          WHEN NEW.owner = OLD.owner AND NEW.lease_expires_at != OLD.lease_expires_at
          BEGIN
            SELECT RAISE(FAIL, 'temporary renewal outage');
          END
        `);

        await jest.advanceTimersByTimeAsync(20_000);

        expect(() => lockContext.assertLockHeld()).toThrow(
          'Failed to renew EE registration lock for component:default/ee',
        );
      });

      await expect(operation).rejects.toThrow(
        'Failed to renew EE registration lock for component:default/ee',
      );
    } finally {
      await knex.raw('DROP TRIGGER IF EXISTS fail_ee_lock_renewal');
      jest.useRealTimers();
      await knex.destroy();
    }
  });

  it('marks the lease lost and throws when a mutation cannot find a live lease', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);

    await expect(
      lock('component:default/ee', async lockContext => {
        await knex('ee_registration_lock_leases')
          .where({ entity_ref: 'component:default/ee' })
          .update({ lease_expires_at: 0 });
        await lockContext.beginMutation();
      }),
    ).rejects.toThrow(
      'EE registration lock lease was lost before mutation for component:default/ee',
    );

    await knex.destroy();
  });

  it('marks the lease lost and throws when updating registration state cannot find a live lease', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);

    await expect(
      lock('component:default/ee', async lockContext => {
        await lockContext.beginRegistrationMutation();
        await knex('ee_registration_lock_leases')
          .where({ entity_ref: 'component:default/ee' })
          .update({ lease_expires_at: 0 });
        await lockContext.completeRegistration();
      }),
    ).rejects.toThrow(
      'EE registration lock lease was lost while updating registration state for component:default/ee',
    );

    await knex.destroy();
  });

  it('marks the lease lost when a scheduled renewal cannot find the owned lease', async () => {
    jest.useFakeTimers();
    try {
      const knex = await testDatabases.init('SQLITE_3');
      const lock = createEERegistrationLock({
        getClient: async () => knex,
      } as any);

      const operation = lock('component:default/ee', async lockContext => {
        await knex('ee_registration_lock_leases')
          .where({ entity_ref: 'component:default/ee' })
          .update({ owner: 'a-different-owner' });

        await jest.advanceTimersByTimeAsync(20_000);

        expect(() => lockContext.assertLockHeld()).toThrow(
          'EE registration lock lease was lost for component:default/ee',
        );
      });

      await expect(operation).rejects.toThrow(
        'EE registration lock lease was lost for component:default/ee',
      );
      await knex.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects when acquiring the lock encounters a database error', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);

    await lock('component:default/ee', async () => undefined);
    await knex.schema.dropTable('ee_registration_lock_leases');

    await expect(
      lock('component:default/ee', async () => undefined),
    ).rejects.toThrow();

    await knex.destroy();
  });

  it('times out waiting for a lock held by another owner', async () => {
    jest.useFakeTimers();
    try {
      const knex = await testDatabases.init('SQLITE_3');
      const lockA = createEERegistrationLock({
        getClient: async () => knex,
      } as any);
      const lockB = createEERegistrationLock({
        getClient: async () => knex,
      } as any);

      let signalAcquired!: () => void;
      const acquired = new Promise<void>(resolve => {
        signalAcquired = resolve;
      });

      const holder = lockA('component:default/ee', async () => {
        signalAcquired();
        await jest.advanceTimersByTimeAsync(70_000);
      });

      await acquired;
      const waiter = lockB('component:default/ee', async () => undefined);
      waiter.catch(() => {});

      await holder;
      await expect(waiter).rejects.toThrow(
        'Timed out waiting for EE registration lock for component:default/ee',
      );

      await knex.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries an owner-scoped release after a database failure', async () => {
    const knex = await testDatabases.init('SQLITE_3');
    const lock = createEERegistrationLock({
      getClient: async () => knex,
    } as any);
    let signalReleaseFailure!: () => void;
    const releaseFailed = new Promise<void>(resolve => {
      signalReleaseFailure = resolve;
    });
    const onQueryError = (error: Error, query: { sql: string }) => {
      if (
        query.sql.includes('ee_registration_lock_leases') &&
        error.message.includes('temporary release outage')
      ) {
        signalReleaseFailure();
      }
    };
    knex.on('query-error', onQueryError);

    const operation = lock('component:default/ee', async lockContext => {
      await lockContext.beginMutation();
      await knex.raw(`
        CREATE TRIGGER fail_ee_lock_release
        BEFORE UPDATE ON ee_registration_lock_leases
        WHEN NEW.owner IS NULL
        BEGIN
          SELECT RAISE(FAIL, 'temporary release outage');
        END
      `);
      return 'registered';
    });

    try {
      await releaseFailed;
      await knex.raw('DROP TRIGGER fail_ee_lock_release');
      await expect(operation).resolves.toBe('registered');

      const [lease] = await knex('ee_registration_lock_leases').select('*');
      expect(lease).toMatchObject({
        entity_ref: 'component:default/ee',
        owner: null,
      });
      expect(Number(lease.mutation_in_progress)).toBe(0);
    } finally {
      knex.removeListener('query-error', onQueryError);
      await knex.raw('DROP TRIGGER IF EXISTS fail_ee_lock_release');
      await knex.destroy();
    }
  });
});
