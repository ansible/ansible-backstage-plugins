import { Config } from '@backstage/config';
import { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';
import { RegistryConnection } from '@ansible/automation-content-common';

export interface RegistryProviderEntry {
  connection: RegistryConnection;
  schedule: SchedulerServiceTaskScheduleDefinition;
  owner?: string;
  system?: string;
}

const DEFAULT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { minutes: 30 },
  timeout: { minutes: 10 },
  initialDelay: { seconds: 5 },
};

/**
 * Read registry definitions from configuration.
 *
 * Placed under `catalog.providers.*` rather than the `ansible.*` plugin namespace
 * because that is Backstage's own convention for entity providers, and staying
 * compatible with upstream tooling matters more here than namespace uniformity.
 */
export function readRegistryConfigs(root: Config): RegistryProviderEntry[] {
  const providers = root.getOptionalConfig(
    'catalog.providers.automationContent',
  );
  if (!providers) return [];

  const registriesConfig = providers.getOptionalConfigArray('registries') ?? [];

  return registriesConfig.map(registry => {
    const authConfig = registry.getOptionalConfig('auth');
    const authType = (authConfig?.getOptionalString('type') ?? 'anonymous') as
      | 'anonymous'
      | 'basic'
      | 'bearer';

    return {
      connection: {
        name: registry.getString('name'),
        url: registry.getString('url'),
        auth: {
          type: authType,
          username: authConfig?.getOptionalString('username'),
          password: authConfig?.getOptionalString('password'),
          token: authConfig?.getOptionalString('token'),
        },
        namespaces: registry.getOptionalStringArray('namespaces'),
        repositories: registry.getOptionalStringArray('repositories'),
        insecure: registry.getOptionalBoolean('insecure'),
        rewriteAuthRealmHost: registry.getOptionalBoolean(
          'rewriteAuthRealmHost',
        ),
      },
      schedule: DEFAULT_SCHEDULE,
      owner:
        registry.getOptionalString('owner') ??
        providers.getOptionalString('owner'),
      system: registry.getOptionalString('system'),
    };
  });
}
