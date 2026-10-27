import { Config } from '@backstage/config';
import { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
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

    const caFile = registry.getOptionalString('caFile');
    if (caFile && registry.getOptionalBoolean('insecure')) {
      throw new Error(
        `registry "${name}" sets both caFile and insecure: verify against the ` +
          `bundle or opt out of verification, not both`,
      );
    }

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
        ca: caFile ? readCaBundle(name, caFile) : undefined,
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

/**
 * Read a registry's CA bundle at startup, not lazily: an unreadable or invalid
 * bundle is a configuration error, and failing the process at boot beats
 * failing a sync later.
 *
 * Every PEM block is parsed with Node's certificate parser. A bundle the
 * parser rejects is a bundle the TLS handshake would reject too — better to
 * learn that at boot than from a sync failure per registry, per run.
 */
function readCaBundle(registry: string, path: string): string {
  let pem: string;
  try {
    pem = readFileSync(path, 'utf8');
  } catch (error) {
    const reason = (error as { code?: string }).code ?? String(error);
    throw new Error(
      `cannot read CA bundle for registry "${registry}": ${path} (${reason})`,
    );
  }

  const blocks = pemBlocks(pem);
  if (blocks.length === 0) {
    throw new Error(
      `cannot read CA bundle for registry "${registry}": ${path} ` +
        `(no PEM certificate found)`,
    );
  }
  try {
    // Every block must be accepted by Node's certificate parser.
    blocks.forEach(block => new X509Certificate(block));
  } catch {
    throw new Error(
      `cannot read CA bundle for registry "${registry}": ${path} ` +
        `(invalid certificate in bundle)`,
    );
  }
  return pem;
}

/**
 * Extract the PEM certificate blocks from a bundle.
 *
 * Scanned with `indexOf` rather than a regex: the codebase's rule against
 * backtracking patterns costs nothing to keep here. An unterminated block is
 * dropped — the parser in `readCaBundle` is the authority on validity, and a
 * trailing fragment without its END marker is not a certificate.
 */
function pemBlocks(pem: string): string[] {
  const begin = '-----BEGIN CERTIFICATE-----';
  const end = '-----END CERTIFICATE-----';
  const blocks: string[] = [];
  let start = pem.indexOf(begin);
  while (start >= 0) {
    const stop = pem.indexOf(end, start + begin.length);
    if (stop < 0) break;
    blocks.push(pem.slice(start, stop + end.length));
    start = pem.indexOf(begin, stop + end.length);
  }
  return blocks;
}
