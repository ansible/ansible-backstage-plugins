import {
  coreServices,
  createServiceFactory,
  createServiceRef,
} from '@backstage/backend-plugin-api';
import type {
  AuthService,
  BackstageCredentials,
  DiscoveryService,
} from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';

export type EELifecycleCleanupResult = {
  mode: 'noop' | 'location' | 'entity-transient' | 'provider';
  warning?: string;
};

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

export const eeEntityLifecycleServiceRef =
  createServiceRef<EEEntityLifecycleService>({
    id: 'ansible.ee-entity-lifecycle',
    scope: 'plugin',
  });

export function createEEEntityLifecycleService(options: {
  auth: AuthService;
  discovery: DiscoveryService;
}): EEEntityLifecycleService {
  const { auth, discovery } = options;
  const request = async (
    path: string,
    credentials: BackstageCredentials,
    init?: RequestInit,
  ): Promise<Response> => {
    const baseUrl = await discovery.getBaseUrl('catalog');
    const { token } = await auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    return response;
  };

  const readError = async (response: Response): Promise<string> => {
    try {
      const body = await response.json();
      return body?.error ?? `${response.status} ${response.statusText}`;
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  };

  return {
    async registerExecutionEnvironment(entity, credentials) {
      const response = await request('/ansible/ee', credentials, {
        method: 'POST',
        body: JSON.stringify({ entity }),
      });
      if (!response.ok) {
        throw new Error(
          `Failed to register Execution Environment: ${await readError(
            response,
          )}`,
        );
      }
    },
    async unregisterExecutionEnvironment(name, credentials, options) {
      const response = await request(
        `/ansible/ee/${encodeURIComponent(name)}${
          options?.skipProviderManaged ? '?skipProviderManaged=true' : ''
        }`,
        credentials,
        { method: 'DELETE' },
      );
      if (response.status === 204) return { mode: 'noop' };
      if (!response.ok) {
        throw new Error(
          `Failed to unregister Execution Environment: ${await readError(
            response,
          )}`,
        );
      }
      const result = await response.json();
      return {
        mode: result.mode ?? 'noop',
        ...(result.warning ? { warning: result.warning } : {}),
      };
    },
  };
}

export const eeEntityLifecycleServiceFactory = createServiceFactory({
  service: eeEntityLifecycleServiceRef,
  deps: {
    auth: coreServices.auth,
    discovery: coreServices.discovery,
  },
  factory: createEEEntityLifecycleService,
});
