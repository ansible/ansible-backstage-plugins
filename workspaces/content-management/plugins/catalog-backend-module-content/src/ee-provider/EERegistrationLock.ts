import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '@backstage/backend-plugin-api';

type KnexClient = Awaited<ReturnType<DatabaseService['getClient']>>;

const LOCK_TABLE = 'ee_registration_lock_leases';
const LEASE_DURATION_MS = 60_000;
const LEASE_RENEWAL_INTERVAL_MS = 20_000;
const LOCK_POLL_INTERVAL_MS = 50;
const LOCK_RELEASE_RETRY_INTERVAL_MS = 1_000;
const LOCK_WAIT_TIMEOUT_MS = 60_000;

export type EERegistrationState = 'none' | 'pending' | 'registered';

export type EERegistrationLock = (<T>(
  entityRef: string,
  operation: (lock: {
    assertLockHeld: () => void;
    beginMutation: () => Promise<void>;
    beginRegistrationMutation: () => Promise<void>;
    completeRegistration: () => Promise<void>;
    clearRegistration: () => Promise<void>;
    registrationState: EERegistrationState;
  }) => Promise<T>,
) => Promise<T>) & {
  initialize: () => Promise<void>;
  isReady: () => boolean;
};

export function createEERegistrationLock(
  database: DatabaseService,
): EERegistrationLock {
  let knex: KnexClient | undefined;
  let schemaReady: Promise<void> | undefined;

  const initialize = async () => {
    if (!schemaReady) {
      schemaReady = (async () => {
        const client = await database.getClient();
        await ensureLockTable(client);
        knex = client;
      })();
    }
    try {
      await schemaReady;
    } catch (error) {
      schemaReady = undefined;
      knex = undefined;
      throw error;
    }
  };

  const withLock = async <T>(
    entityRef: string,
    operation: (lock: {
      assertLockHeld: () => void;
      beginMutation: () => Promise<void>;
      beginRegistrationMutation: () => Promise<void>;
      completeRegistration: () => Promise<void>;
      clearRegistration: () => Promise<void>;
      registrationState: EERegistrationState;
    }) => Promise<T>,
  ): Promise<T> => {
    await initialize();
    if (!knex) throw new Error('EE registration lock is not initialized');
    const client = knex;

    const owner = randomUUID();
    const registrationState = await acquireLock(client, entityRef, owner);

    let leaseLost: Error | undefined;
    let renewalInFlight: Promise<void> | undefined;
    const assertLockHeld = () => {
      if (leaseLost) throw leaseLost;
    };
    const beginMutation = async (registrationPending: boolean) => {
      assertLockHeld();
      // The provider API has no fencing token. Keep this flag set until its
      // mutation promise settles; a crashed process requires operator recovery.
      const mutationState = registrationPending
        ? { mutation_in_progress: true, registration_state: 'pending' }
        : { mutation_in_progress: true };
      const updated = await client(LOCK_TABLE)
        .where({ entity_ref: entityRef, owner })
        .andWhere('lease_expires_at', '>', Date.now())
        .update(mutationState);
      if (Number(updated) !== 1) {
        leaseLost = new Error(
          `EE registration lock lease was lost before mutation for ${entityRef}`,
        );
        assertLockHeld();
      }
    };
    const updateRegistrationState = async (
      nextState: Exclude<EERegistrationState, 'pending'>,
    ) => {
      assertLockHeld();
      const updated = await client(LOCK_TABLE)
        .where({ entity_ref: entityRef, owner, mutation_in_progress: true })
        .andWhere('lease_expires_at', '>', Date.now())
        .update({ registration_state: nextState });
      if (Number(updated) !== 1) {
        leaseLost = new Error(
          `EE registration lock lease was lost while updating registration state for ${entityRef}`,
        );
        assertLockHeld();
      }
    };
    const heartbeat = setInterval(() => {
      if (!renewalInFlight) {
        renewalInFlight = renewLock(client, entityRef, owner)
          .then(held => {
            if (!held) {
              leaseLost = new Error(
                `EE registration lock lease was lost for ${entityRef}`,
              );
            }
          })
          .catch(error => {
            leaseLost = new Error(
              `Failed to renew EE registration lock for ${entityRef}`,
              { cause: error },
            );
          })
          .finally(() => {
            renewalInFlight = undefined;
          });
      }
    }, LEASE_RENEWAL_INTERVAL_MS);

    try {
      const result = await operation({
        assertLockHeld,
        beginMutation: () => beginMutation(false),
        beginRegistrationMutation: () => beginMutation(true),
        completeRegistration: () => updateRegistrationState('registered'),
        clearRegistration: () => updateRegistrationState('none'),
        registrationState,
      });
      if (renewalInFlight !== undefined) await renewalInFlight;
      assertLockHeld();
      return result;
    } finally {
      clearInterval(heartbeat);
      if (renewalInFlight !== undefined) await renewalInFlight;
      await releaseLock(client, entityRef, owner);
    }
  };

  return Object.assign(withLock, {
    initialize,
    isReady: () => knex !== undefined,
  });
}

async function ensureLockTable(knex: KnexClient): Promise<void> {
  if (!(await knex.schema.hasTable(LOCK_TABLE))) {
    try {
      await knex.schema.createTable(LOCK_TABLE, table => {
        table.string('entity_ref').primary();
        table.string('owner').nullable();
        table.bigInteger('lease_expires_at').notNullable().defaultTo(0);
        table.boolean('mutation_in_progress').notNullable().defaultTo(false);
        table.string('registration_state').notNullable().defaultTo('pending');
      });
    } catch (error) {
      // Multiple replicas may initialize the table at the same time.
      if (!(await knex.schema.hasTable(LOCK_TABLE))) throw error;
    }
  }

  if (!(await knex.schema.hasColumn(LOCK_TABLE, 'mutation_in_progress'))) {
    try {
      await knex.schema.alterTable(LOCK_TABLE, table => {
        table.boolean('mutation_in_progress').notNullable().defaultTo(false);
      });
    } catch (error) {
      // Multiple replicas may add the column at the same time.
      if (!(await knex.schema.hasColumn(LOCK_TABLE, 'mutation_in_progress'))) {
        throw error;
      }
    }
  }

  if (!(await knex.schema.hasColumn(LOCK_TABLE, 'registration_state'))) {
    try {
      await knex.schema.alterTable(LOCK_TABLE, table => {
        table.string('registration_state').notNullable().defaultTo('pending');
      });
    } catch (error) {
      // Multiple replicas may add the column at the same time.
      if (!(await knex.schema.hasColumn(LOCK_TABLE, 'registration_state'))) {
        throw error;
      }
    }
  }
}

function acquireLock(
  knex: KnexClient,
  entityRef: string,
  owner: string,
): Promise<EERegistrationState> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      if (Date.now() >= deadline) {
        reject(
          new Error(
            `Timed out waiting for EE registration lock for ${entityRef}`,
          ),
        );
        return;
      }

      try {
        const state = await tryAcquireLock(knex, entityRef, owner);
        if (state !== undefined) {
          resolve(state);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }

      if (Date.now() >= deadline) {
        reject(
          new Error(
            `Timed out waiting for EE registration lock for ${entityRef}`,
          ),
        );
        return;
      }

      setTimeout(() => void attempt(), LOCK_POLL_INTERVAL_MS);
    };

    void attempt();
  });
}

function tryAcquireLock(
  knex: KnexClient,
  entityRef: string,
  owner: string,
): Promise<EERegistrationState | undefined> {
  return knex.transaction(async transaction => {
    const now = Date.now();
    await transaction(LOCK_TABLE)
      .insert({
        entity_ref: entityRef,
        owner: null,
        lease_expires_at: 0,
        registration_state: 'none',
      })
      .onConflict('entity_ref')
      .ignore();
    const updated = await transaction(LOCK_TABLE)
      .where({ entity_ref: entityRef })
      .andWhere('lease_expires_at', '<=', now)
      // applyMutation has no fencing token, so never reclaim an active write.
      .andWhere('mutation_in_progress', false)
      .update({ owner, lease_expires_at: now + LEASE_DURATION_MS });
    if (Number(updated) !== 1) return undefined;
    const row = await transaction(LOCK_TABLE)
      .select('registration_state')
      .where({ entity_ref: entityRef })
      .first();
    return parseRegistrationState(row?.registration_state);
  });
}

function parseRegistrationState(value: unknown): EERegistrationState {
  if (value === 'none' || value === 'registered') return value;
  // Unknown persisted states are treated as pending to fail closed.
  return 'pending';
}

async function renewLock(
  knex: KnexClient,
  entityRef: string,
  owner: string,
): Promise<boolean> {
  const updated = await knex(LOCK_TABLE)
    .where({ entity_ref: entityRef, owner })
    .update({ lease_expires_at: Date.now() + LEASE_DURATION_MS });
  return Number(updated) === 1;
}

async function releaseLock(
  knex: KnexClient,
  entityRef: string,
  owner: string,
): Promise<void> {
  try {
    await knex(LOCK_TABLE).where({ entity_ref: entityRef, owner }).update({
      owner: null,
      lease_expires_at: 0,
      mutation_in_progress: false,
    });
  } catch {
    // Keep retrying the idempotent, owner-scoped release after transient DB
    // failures so an unfinished mutation cannot remain marked indefinitely.
    await new Promise(resolve =>
      setTimeout(resolve, LOCK_RELEASE_RETRY_INTERVAL_MS),
    );
    await releaseLock(knex, entityRef, owner);
  }
}
