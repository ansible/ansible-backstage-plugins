import {
  parseEntityRef,
  stringifyEntityRef,
  type Entity,
} from '@backstage/catalog-model';
import { InputError, NotAllowedError } from '@backstage/errors';
import type {
  CatalogEntityMutation,
  CatalogEntityProvider,
  CatalogEntityRegistrationState,
} from './types';

// Backstage's default catalog rules, with mixed case accepted before canonicalization.
const KIND = /^[A-Za-z][A-Za-z0-9]{0,62}$/;
const NAMESPACE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?$/;

function matchesPart(value: string | undefined, allowed: RegExp): boolean {
  // Comparing the full match also rejects a trailing newline before JS's `$`.
  return value !== undefined && allowed.exec(value)?.[0] === value;
}

export function fullEntityRef(value: string): string {
  const parts = typeof value === 'string' ? value.split(/[:/]/) : [];
  if (
    parts.length !== 3 ||
    value !== `${parts[0]}:${parts[1]}/${parts[2]}` ||
    !matchesPart(parts[0], KIND) ||
    !matchesPart(parts[1], NAMESPACE) ||
    !matchesPart(parts[2], NAME)
  ) {
    throw new InputError(
      'A full kind:namespace/name entity reference is required',
    );
  }
  return stringifyEntityRef(parseEntityRef(value));
}

/** Keep consumer failures visible even if an invalid provider swallows them. */
export async function invokeCatalogEntityProvider<T>(
  withMutation: CatalogEntityProvider['withEntityMutation'],
  entityRef: string,
  assertReady: () => void,
  operation: (mutation: CatalogEntityMutation) => Promise<T>,
): Promise<T> {
  let pending: Promise<T> | undefined;
  let claimed = false;
  let finished = false;
  let duplicate: Error | undefined;
  let returnedEarly = false;
  let acceptingCallback = true;
  try {
    await withMutation({ entityRef }, mutation => {
      if (!acceptingCallback) {
        return observedRejection(
          new Error('Provider invoked a mutation callback after returning'),
        );
      }
      if (claimed) {
        duplicate = new Error('Provider invoked a mutation callback twice');
        return observedRejection(duplicate);
      }
      // Reserve admission before reading any provider-owned properties/getters.
      claimed = true;
      pending = runCatalogEntityMutation(
        entityRef,
        mutation,
        assertReady,
        operation,
      );
      pending.then(
        () => {
          finished = true;
        },
        () => {
          finished = true;
        },
      );
      return pending;
    });
    returnedEarly = claimed && !finished;
  } finally {
    acceptingCallback = false;
    // Do not return with live callback work, including on provider failure.
    await pending?.catch(() => undefined);
  }
  if (pending === undefined)
    throw new Error('Provider did not invoke the mutation callback');
  const result = await pending;
  if (duplicate) throw duplicate;
  if (returnedEarly)
    throw new Error('Provider returned before its mutation completed');
  return result;
}

function observedRejection<T>(error: Error): Promise<T> {
  const rejected = Promise.reject<T>(error);
  // Return the rejected promise unchanged. Awaiting providers still see the
  // error, but providers that discard it cannot trigger an unhandled rejection.
  rejected.catch(() => undefined);
  return rejected;
}

/** Keep handles scoped to a callback, including when callers forget an await. */
export async function runCatalogEntityMutation<T>(
  entityRef: string,
  mutation: CatalogEntityMutation,
  assertReady: () => void,
  operation: (mutation: CatalogEntityMutation) => Promise<T>,
): Promise<T> {
  if (
    !mutation ||
    typeof mutation.assertLockHeld !== 'function' ||
    typeof mutation.upsert !== 'function' ||
    typeof mutation.remove !== 'function' ||
    typeof mutation.clearRegistration !== 'function'
  ) {
    throw new InputError('Invalid catalog entity mutation');
  }
  let active = true;
  let previousWrite = Promise.resolve();
  const writes: Array<Promise<{ error?: unknown }>> = [];
  const assertActive = () => {
    if (!active) throw new NotAllowedError('Catalog entity mutation has ended');
    assertReady();
    mutation.assertLockHeld();
  };
  const write = (prepare: () => () => Promise<void>): Promise<void> => {
    const previous = previousWrite;
    let resolvePrepared!: (execute: () => Promise<void>) => void;
    let rejectPrepared!: (error: unknown) => void;
    const prepared = new Promise<() => Promise<void>>((resolve, reject) => {
      resolvePrepared = resolve;
      rejectPrepared = reject;
    });
    const task = (async () => {
      const execute = await prepared;
      await previous;
      assertReady();
      mutation.assertLockHeld();
      await execute();
    })();
    previousWrite = task;
    // Observe every failure immediately, and drain writes before releasing the
    // provider lock even if the consumer throws or neglects to await a write.
    writes.push(
      task.then(
        () => ({}),
        error => ({ error }),
      ),
    );
    // Reserve and observe this queue entry before cloning can invoke getters
    // that submit another write. Preparation still captures the payload now.
    try {
      assertActive();
      resolvePrepared(prepare());
    } catch (error) {
      rejectPrepared(error);
    }
    return task;
  };
  const guarded: CatalogEntityMutation = {
    assertLockHeld: assertActive,
    get registrationState(): CatalogEntityRegistrationState {
      assertActive();
      const state = mutation.registrationState;
      assertValidRegistrationState(state);
      return state;
    },
    upsert: (entity: Entity) =>
      write(() => {
        // Take ownership of the payload before a queue wait or provider await.
        const snapshot = structuredClone(entity);
        if (fullEntityRef(stringifyEntityRef(snapshot)) !== entityRef) {
          throw new InputError('Entity does not match the locked reference');
        }
        return () => mutation.upsert(snapshot);
      }),
    remove: () => write(() => () => mutation.remove()),
    clearRegistration: () => write(() => () => mutation.clearRegistration()),
  };
  try {
    // Invalid state must not be mistaken for an absent entity by a consumer.
    assertActive();
    assertValidRegistrationState(mutation.registrationState);
    const result = await operation(guarded);
    active = false;
    const outcomes = await Promise.all(writes);
    const failed = outcomes.find(outcome => 'error' in outcome);
    if (failed) throw failed.error;
    return result;
  } finally {
    active = false;
    await Promise.all(writes);
  }
}

function assertValidRegistrationState(
  state: CatalogEntityRegistrationState,
): void {
  if (!['none', 'pending', 'registered'].includes(state)) {
    throw new InputError('Invalid catalog entity registration state');
  }
}
