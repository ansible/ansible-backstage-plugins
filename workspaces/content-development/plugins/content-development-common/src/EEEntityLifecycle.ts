import { createServiceRef } from '@backstage/backend-plugin-api';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';

export type EERegistrationState = 'none' | 'pending' | 'registered';

export type EERegistrationLockContext = {
  assertLockHeld: () => void;
  beginMutation: () => Promise<void>;
  beginRegistrationMutation: () => Promise<void>;
  completeRegistration: () => Promise<void>;
  clearRegistration: () => Promise<void>;
  registrationState: EERegistrationState;
};

export type EERegistrationLock = <T>(
  entityRef: string,
  operation: (lock: EERegistrationLockContext) => Promise<T>,
) => Promise<T>;

export type EELifecycleCleanupResult = {
  mode: 'noop' | 'location' | 'entity-transient' | 'provider';
  warning?: string;
};

export interface EEEntityProviderService {
  initializeRegistrationLock(lock: EERegistrationLock): void;
  withRegistrationLock<T>(
    entityRef: string,
    operation: (lock: EERegistrationLockContext) => Promise<T>,
  ): Promise<T>;
  getProviderName(): string;
  connect(connection: any): Promise<void>;
  register(entity: any): Promise<void>;
  unregister(name: string): Promise<void>;
}

export interface EEEntityLifecycleService {
  registerExecutionEnvironment(
    entity: Entity,
    credentials: BackstageCredentials,
  ): Promise<void>;
  unregisterExecutionEnvironment(
    name: string,
    credentials: BackstageCredentials,
    options?: { skipProviderManaged?: boolean },
  ): Promise<EELifecycleCleanupResult>;
}

export const eeEntityProviderServiceRef =
  createServiceRef<EEEntityProviderService>({
    id: 'ansible.ee-entity-provider',
    scope: 'root',
  });

export const eeEntityLifecycleServiceRef =
  createServiceRef<EEEntityLifecycleService>({
    id: 'ansible.ee-entity-lifecycle',
    scope: 'plugin',
  });
