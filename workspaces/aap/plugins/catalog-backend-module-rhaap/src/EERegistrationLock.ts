import type { DatabaseService } from '@backstage/backend-plugin-api';

const LOCK_TABLE = 'ee_registration_locks';

export type EERegistrationLock = <T>(
  entityRef: string,
  operation: () => Promise<T>,
) => Promise<T>;

export function createEERegistrationLock(
  database: DatabaseService,
): EERegistrationLock {
  let schemaReady: Promise<void> | undefined;

  return async (entityRef, operation) => {
    // The plugin database is shared by backend replicas, unlike a process-local mutex.
    const knex = await database.getClient();
    schemaReady ??= (async () => {
      if (await knex.schema.hasTable(LOCK_TABLE)) return;
      try {
        await knex.schema.createTable(LOCK_TABLE, table => {
          table.string('entity_ref').primary();
        });
      } catch (error) {
        // Multiple replicas may initialize the table at the same time.
        if (!(await knex.schema.hasTable(LOCK_TABLE))) throw error;
      }
    })();
    await schemaReady;

    return knex.transaction(async transaction => {
      await transaction(LOCK_TABLE)
        .insert({ entity_ref: entityRef })
        .onConflict('entity_ref')
        .ignore();
      await transaction(LOCK_TABLE)
        .select('entity_ref')
        .where({ entity_ref: entityRef })
        .forUpdate()
        .first();

      return operation();
    });
  };
}
