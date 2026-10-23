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
 * Validate a configured registry endpoint before anything can use it.
 *
 * Registry URLs are install-time configuration, and that is the SSRF trust
 * boundary: no runtime path may introduce or change an endpoint. The boundary
 * only holds if a bad endpoint fails loudly at startup — with the registry's
 * name in the message — rather than surfacing as a confusing request failure
 * mid-sync, or being quietly fetched anyway. This is the same check
 * `POST /config/validate` offers interactively; here it is enforced, not
 * advised.
 */
function validateRegistryUrl(name: string, url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `automation-content registry "${name}": url is not a valid absolute URL: "${url}"`,
    );
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `automation-content registry "${name}": url must start with http:// or ` +
        `https://, got "${url}"`,
    );
  }
}

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
    const name = registry.getString('name');
    const url = registry.getString('url');
    validateRegistryUrl(name, url);

    const authConfig = registry.getOptionalConfig('auth');
    const authType = (authConfig?.getOptionalString('type') ?? 'anonymous') as
      | 'anonymous'
      | 'basic'
      | 'bearer';

    return {
      connection: {
        name,
        url,
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
