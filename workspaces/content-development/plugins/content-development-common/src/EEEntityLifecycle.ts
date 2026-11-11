import { createServiceRef } from '@backstage/backend-plugin-api';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import type { EntityProviderConnection } from '@backstage/plugin-catalog-node';

export type EELifecycleCleanupResult = {
  mode: 'noop' | 'location' | 'entity-transient' | 'provider';
  warning?: string;
};

export interface EEEntityProviderService {
  getProviderName(): string;
  connect(connection: EntityProviderConnection): Promise<void>;
  register(entity: Entity): Promise<void>;
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
