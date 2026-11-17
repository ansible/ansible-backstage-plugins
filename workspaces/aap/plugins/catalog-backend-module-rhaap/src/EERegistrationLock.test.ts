import { mockServices, TestDatabases } from '@backstage/backend-test-utils';
import { createEERegistrationLock } from './EERegistrationLock';
import { EEEntityProvider } from './providers/EEEntityProvider';

const testDatabases = TestDatabases.create({ ids: ['SQLITE_3'] });

describe('createEERegistrationLock', () => {
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
    const provider = new EEEntityProvider(mockServices.logger.mock());
    const applyMutation = jest.fn(async ({ added }: any) => {
      for (const { entity } of added) {
        await knex('catalog_entities')
          .insert({ entity_ref: `component:default/${entity.metadata.name}` })
          .onConflict('entity_ref')
          .merge();
      }
    });
    await provider.connect({ applyMutation } as any);
    const entity = {
      kind: 'Component',
      metadata: { name: 'ee' },
      spec: { type: 'execution-environment' },
    };
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
      async ({ assertLockHeld, beginMutation }) => {
        assertLockHeld();
        const existing = await knex('catalog_entities')
          .where({ entity_ref: 'component:default/ee' })
          .first();
        observations.push(Boolean(existing));
        signalFirstRead();
        await firstGate;
        assertLockHeld();
        await beginMutation();
        await provider.registerExecutionEnvironment(entity);
      },
    );

    await firstRead;
    let secondStarted = false;
    const second = lockB(
      'component:default/ee',
      async ({ assertLockHeld, beginMutation }) => {
        secondStarted = true;
        assertLockHeld();
        const existing = await knex('catalog_entities')
          .where({ entity_ref: 'component:default/ee' })
          .first();
        observations.push(Boolean(existing));
        await beginMutation();
        await provider.registerExecutionEnvironment(entity);
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
    const provider = new EEEntityProvider(mockServices.logger.mock());
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
    const applyMutation = jest.fn(async ({ added }: any) => {
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
        for (const { entity } of added) {
          await knex('catalog_entities')
            .insert({ entity_ref: `component:default/${entity.metadata.name}` })
            .onConflict('entity_ref')
            .merge();
        }
      } finally {
        activeMutations -= 1;
      }
    });
    await provider.connect({ applyMutation } as any);
    const entity = {
      kind: 'Component',
      metadata: { name: 'ee' },
      spec: { type: 'execution-environment' },
    };

    const first = lockA('component:default/ee', async lock => {
      await lock.beginMutation();
      await provider.registerExecutionEnvironment(entity);
    });
    await mutationStarted;

    await knex('ee_registration_lock_leases')
      .where({ entity_ref: 'component:default/ee' })
      .update({ lease_expires_at: 0 });

    let secondStarted = false;
    const second = lockB('component:default/ee', async lock => {
      secondStarted = true;
      await lock.beginMutation();
      await provider.registerExecutionEnvironment(entity);
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

    const operation = lock('component:default/ee', async () => {
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
