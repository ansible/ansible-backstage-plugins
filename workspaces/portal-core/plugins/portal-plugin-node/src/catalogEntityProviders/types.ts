import type { Entity } from '@backstage/catalog-model';

/** Includes interrupted writes that still need replacement authorization. */
export type CatalogEntityRegistrationState = 'none' | 'pending' | 'registered';

/** A provider-owned, locked mutation of one full catalog entity reference. */
export interface CatalogEntityMutation {
  readonly registrationState: CatalogEntityRegistrationState;
  /** Persist pending state before writing, and complete it only after success. */
  upsert(entity: Entity): Promise<void>;
  /** Remove only this provider's registration and clear its durable state. */
  remove(): Promise<void>;
  /** Clear bookkeeping after an authorized removal through the catalog API. */
  clearRegistration(): Promise<void>;
}

/**
 * Implemented by a contributor, never by a feature-specific SDK singleton.
 *
 * The provider owns catalog connectivity, entity validation, durable state and
 * cross-process locking. It must hold the lock for the entire callback and
 * await it before releasing the lock. Consumers authorize inside the callback
 * before mutating. This internal backend contract is not an authorization API.
 */
export interface CatalogEntityProvider {
  /** True only after both the catalog connection and mutation lock are ready. */
  isReady(): boolean;
  withEntityMutation<T>(
    options: { entityRef: string },
    operation: (mutation: CatalogEntityMutation) => Promise<T>,
  ): Promise<T>;
}

export interface CatalogEntityProviderRegistration {
  /** Stable contributor-namespaced ID, selected by trusted host configuration. */
  id: string;
  provider: CatalogEntityProvider;
}

/** Backend-instance registry. Registration alone does not imply readiness. */
export interface CatalogEntityProvidersService {
  register(registration: CatalogEntityProviderRegistration): void;
  get(providerId: string): CatalogEntityProvider;
}
