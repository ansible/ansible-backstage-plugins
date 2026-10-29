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
 * Validate a registry endpoint URL, returning the reason it is unusable, or
 * undefined when it is valid.
 *
 * This one rule is shared by every boundary that judges a registry endpoint:
 * the load-time reader below (which throws) and the backend's advisory
 * `POST /config/validate` (which reports), so the interactive check can never
 * approve an endpoint that prevents startup, or reject one that works.
 *
 * Registry URLs are install-time configuration, and that is the SSRF trust
 * boundary: no runtime path may introduce or change an endpoint. The boundary
 * only holds if a bad endpoint fails loudly at startup. Callers report the
 * registry's name and this reason; the raw URL is deliberately not echoed,
 * because it can embed credentials.
 */
export function registryUrlError(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'is not a valid absolute URL';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'must start with http:// or https://';
  }
  // Components the client cannot honour: Node's fetch refuses URLs with
  // embedded credentials outright, and query or fragment suffixes corrupt the
  // request paths concatenated onto the base. Credentials belong in the
  // dedicated auth fields.
  if (parsed.username || parsed.password) {
    return 'must not embed credentials; use the auth fields instead';
  }
  // A URL can also end in a bare `?` or `#` — someone started typing a query
  // or fragment and stopped. The check below misses that (both parts come
  // back empty), but the stray character survives into the stored URL and
  // then corrupts every request built on it, so the finished URL is checked
  // too.
  const serialized = parsed.toString();
  if (
    parsed.search ||
    parsed.hash ||
    serialized.endsWith('?') ||
    serialized.endsWith('#')
  ) {
    return 'must not include a query or fragment';
  }
  // A double slash inside the path (`https://host//prefix`) is almost always
  // a configuration mistake, and it breaks request building in a confusing
  // way: once the base path is joined onto request paths, the `//` reads as
  // "swap the host", so the client ends up refusing its own configured
  // registry as a foreign origin. Refuse it here, at the boundary, where the
  // mistake is still easy to see. Trailing slashes are trimmed first because
  // they are harmless: request building trims them too.
  let pathOnly = parsed.pathname;
  while (pathOnly.endsWith('/')) pathOnly = pathOnly.slice(0, -1);
  if (pathOnly.includes('//')) {
    return 'must not contain empty path segments';
  }
  return undefined;
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
    const reason = registryUrlError(url);
    if (reason !== undefined) {
      // Stop the backend from starting instead of quietly skipping this
      // registry. A skipped registry looks exactly like one with nothing in
      // it, so the person running the portal would see an empty catalog and
      // never learn that their registry URL was wrong.
      throw new Error(`automation-content registry "${name}": url ${reason}`);
    }

    const authConfig = registry.getOptionalConfig('auth');
    const authType = (authConfig?.getOptionalString('type') ?? 'anonymous') as
      | 'anonymous'
      | 'basic'
      | 'bearer';

    return {
      connection: {
        name,
        // Canonical form, not the raw string: the parser normalises scheme
        // case and surrounding whitespace, which the raw value keeps and the
        // client would then mishandle — a trailing space passes validation
        // but breaks every request, and an uppercase scheme yields broken
        // pull references.
        url: new URL(url).toString(),
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
