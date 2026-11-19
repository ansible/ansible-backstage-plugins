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

export function fullEntityRef(value: string): string {
  // Do not silently select a default kind or namespace for a mutation.
  if (typeof value !== 'string' || !/^[^:/\s]+:[^/\s]+\/[^/\s]+$/.test(value)) {
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
  let finished = false;
  let duplicate: Error | undefined;
  let returnedEarly = false;
  let acceptingCallback = true;
  try {
    await withMutation({ entityRef }, async mutation => {
      if (!acceptingCallback) {
        throw new Error('Provider invoked a mutation callback after returning');
      }
      if (pending) {
        duplicate = new Error('Provider invoked a mutation callback twice');
        throw duplicate;
      }
      pending = runCatalogEntityMutation(
        entityRef,
        mutation,
        assertReady,
        operation,
      );
      void pending.then(
        () => {
          finished = true;
        },
        () => {
          finished = true;
        },
      );
      return pending;
    });
    returnedEarly = Boolean(pending && !finished);
  } finally {
    acceptingCallback = false;
    // Do not return with live callback work, including on provider failure.
    await pending?.catch(() => undefined);
  }
  if (!pending)
    throw new Error('Provider did not invoke the mutation callback');
  if (duplicate) throw duplicate;
  if (returnedEarly)
    throw new Error('Provider returned before its mutation completed');
  return pending;
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
  };
  const write = (execute: () => Promise<void>): Promise<void> => {
    const previous = previousWrite;
    const task = (async () => {
      assertActive();
      await previous;
      assertReady();
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
    return task;
  };
  const guarded: CatalogEntityMutation = {
    get registrationState(): CatalogEntityRegistrationState {
      assertActive();
      const state = mutation.registrationState;
      if (!['none', 'pending', 'registered'].includes(state)) {
        throw new InputError('Invalid catalog entity registration state');
      }
      return state;
    },
    upsert: (entity: Entity) =>
      write(async () => {
        if (stringifyEntityRef(entity) !== entityRef) {
          throw new InputError('Entity does not match the locked reference');
        }
        await mutation.upsert(entity);
      }),
    remove: () => write(() => mutation.remove()),
    clearRegistration: () => write(() => mutation.clearRegistration()),
  };
  try {
    // Invalid state must not be mistaken for an absent entity by a consumer.
    void guarded.registrationState;
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
