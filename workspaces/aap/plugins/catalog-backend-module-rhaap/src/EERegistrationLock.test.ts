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

    const first = lockA('component:default/ee', async assertLockHeld => {
      assertLockHeld();
      const existing = await knex('catalog_entities')
        .where({ entity_ref: 'component:default/ee' })
        .first();
      observations.push(Boolean(existing));
      signalFirstRead();
      await firstGate;
      assertLockHeld();
      await provider.registerExecutionEnvironment(entity);
    });

    await firstRead;
    let secondStarted = false;
    const second = lockB('component:default/ee', async assertLockHeld => {
      secondStarted = true;
      assertLockHeld();
      const existing = await knex('catalog_entities')
        .where({ entity_ref: 'component:default/ee' })
        .first();
      observations.push(Boolean(existing));
      await provider.registerExecutionEnvironment(entity);
    });

    await new Promise(resolve => setTimeout(resolve, 25));
    expect(secondStarted).toBe(false);
    releaseFirst();
    await Promise.all([first, second]);

    expect(observations).toEqual([false, true]);
    expect(applyMutation).toHaveBeenCalledTimes(2);
    await expect(knex('catalog_entities')).resolves.toHaveLength(1);
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
});
