import { createServiceRef } from '@backstage/backend-plugin-api';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';

export type EELifecycleCleanupResult = {
  mode: 'noop' | 'location' | 'entity-transient' | 'provider';
  warning?: string;
};

export interface EEEntityProviderService {
  getProviderName(): string;
  connect(connection: any): Promise<void>;
  register(entity: any): Promise<void>;
  unregister(name: string): Promise<void>;
}

export interface EEEntityLifecycleService {
  registerExecutionEnvironment(
    entity: any,
    credentials: BackstageCredentials,
  ): Promise<void>;
  unregisterExecutionEnvironment(
    name: string,
    credentials: BackstageCredentials,
    options?: { skipProviderManaged?: boolean },
  ): Promise<EELifecycleCleanupResult>;
}

export const eeEntityProviderServiceRef = createServiceRef<EEEntityProviderService>({
  id: 'ansible.ee-entity-provider',
  scope: 'root',
});

export const eeEntityLifecycleServiceRef = createServiceRef<EEEntityLifecycleService>({
  id: 'ansible.ee-entity-lifecycle',
  scope: 'plugin',
});
