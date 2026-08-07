/*
 * Copyright Red Hat
 *
 * Module-level controller so Remove confirmation survives Actions menu unmount.
 */

import type { Entity } from '@backstage/catalog-model';

type Listener = (entity: Entity | null) => void;

let pendingEntity: Entity | null = null;
const listeners = new Set<Listener>();

/** Open the Remove repository confirmation for the given entity. */
export function requestRemoveRepository(entity: Entity): void {
  pendingEntity = entity;
  for (const listener of listeners) {
    listener(entity);
  }
}

/** Clear the pending remove target (cancel or after success). */
export function clearRemoveRepositoryRequest(): void {
  pendingEntity = null;
  for (const listener of listeners) {
    listener(null);
  }
}

/**
 * Subscribe to remove-dialog open/close. Returns unsubscribe.
 * Immediately invokes with the current pending entity (if any).
 */
export function subscribeRemoveRepositoryDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(pendingEntity);
  return () => {
    listeners.delete(listener);
  };
}
