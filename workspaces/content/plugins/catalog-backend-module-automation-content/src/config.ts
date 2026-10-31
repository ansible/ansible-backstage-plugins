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

    const name = registry.getString('name');
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
