import { createServiceRef } from '@backstage/backend-plugin-api';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';

export type EELifecycleCleanupResult = {
  mode: 'noop' | 'location' | 'entity-transient' | 'provider';
  warning?: string;
};

export interface EEEntityLifecycleService {
  getProviderName(): string;
  connect(connection: any): Promise<void>;
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

export const eeEntityLifecycleServiceRef = createServiceRef<EEEntityLifecycleService>({
  id: 'ansible.ee-entity-lifecycle',
  scope: 'root',
});
