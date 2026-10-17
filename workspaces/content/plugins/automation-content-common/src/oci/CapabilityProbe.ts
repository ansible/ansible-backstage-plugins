import { OCIClient } from './OCIClient';
import {
  AuthScheme,
  BackendCapabilities,
  MINIMAL_CAPABILITIES,
  RegistryConnection,
} from './types';

export interface ProbeOptions {
  /**
   * A repository to probe repository-scoped capabilities against. Without one,
   * referrers and pagination cannot be determined and stay at the pessimistic floor.
   */
  sampleRepository?: string;
  /** Declared out-of-band: delete cannot be probed without destroying something. */
  declaredDelete?: BackendCapabilities['delete'];
  /** Declared out-of-band: webhook support is registry configuration, not an API. */
  declaredNotifications?: BackendCapabilities['notifications'];
  logger?: { debug(msg: string): void; warn(msg: string): void };
}

/**
 * Discovers what a registry can actually do.
 *
 * The requirement is to work against any OCI-compliant registry "without reliance on
 * vendor-specific extensions", which means capabilities cannot be assumed — they have to
 * be discovered, and every feature has to gate on the result. Assuming a high floor
 * breaks minimal registries; assuming a low ceiling wastes rich ones.
 *
 * Probing is strictly non-destructive. Anything that could only be established by
 * mutating the registry is left for configuration to declare, and stays `unknown`
 * otherwise — with the corresponding UI affordance hidden rather than guessed at.
 */
export class CapabilityProbe {
  constructor(
    private readonly client: OCIClient,
    private readonly options: ProbeOptions = {},
  ) {}

  async probe(): Promise<BackendCapabilities> {
    const capabilities: BackendCapabilities = {
      ...MINIMAL_CAPABILITIES,
      auth: [],
      notes: [],
    };

    await this.probeAuth(capabilities);
    await this.probeCatalog(capabilities);

    const sample = this.options.sampleRepository;
    if (sample) {
      await this.probeTagPagination(capabilities, sample);
      await this.probeReferrers(capabilities, sample);
    } else {
      capabilities.notes.push(
        'No sample repository configured: referrers and tag pagination were not probed ' +
          'and remain at the pessimistic default.',
      );
    }

    capabilities.delete = this.options.declaredDelete ?? 'unknown';
    if (capabilities.delete === 'unknown') {
      capabilities.notes.push(
        'Delete support is not probed because probing would be destructive. Declare it ' +
          'in configuration to enable delete affordances.',
      );
    }

    capabilities.notifications =
      this.options.declaredNotifications ?? 'poll-only';
    if (capabilities.notifications === 'poll-only') {
      capabilities.notes.push(
        'No push notifications declared: drift detection falls back to digest polling.',
      );
    }

    return capabilities;
  }

  /** `GET /v2/` tells us both reachability and the advertised auth scheme. */
  private async probeAuth(capabilities: BackendCapabilities): Promise<void> {
    const ping = await this.client.ping();
    const schemes = new Set<AuthScheme>();

    if (ping.status === 200) {
      schemes.add('anonymous');
    }
    if (ping.challenge) {
      const scheme = ping.challenge.trim().split(/\s+/)[0]?.toLowerCase();
      if (scheme === 'bearer') schemes.add('bearer');
      else if (scheme === 'basic') schemes.add('basic');
    }
    if (schemes.size === 0) {
      schemes.add('anonymous');
      capabilities.notes.push(
        `Registry /v2/ returned ${ping.status}; auth scheme could not be determined.`,
      );
    }
    capabilities.auth = [...schemes];
  }

  /**
   * `_catalog` is optional in the spec and commonly disabled on hosted registries.
   *
   * Must be probed by status code, not by enumerating: a disabled catalog and an empty
   * one both produce zero repositories, so an empty result proves nothing.
   */
  private async probeCatalog(capabilities: BackendCapabilities): Promise<void> {
    try {
      capabilities.catalogEnumeration = await this.client.supportsCatalog();
    } catch (error) {
      capabilities.catalogEnumeration = false;
      this.options.logger?.debug(`catalog probe failed: ${String(error)}`);
    }
    if (!capabilities.catalogEnumeration) {
      capabilities.notes.push(
        '_catalog enumeration unavailable; an explicit repository list is required.',
      );
    }
  }

  private async probeTagPagination(
    capabilities: BackendCapabilities,
    repository: string,
  ): Promise<void> {
    try {
      const res = await this.client.request(`/v2/${repository}/tags/list?n=1`, {
        headers: { Accept: 'application/json' },
      });
      capabilities.tagPagination = res.headers.get('link') !== null;
      if (!capabilities.tagPagination) {
        capabilities.notes.push(
          'Tag listing returned no Link header; pagination is unsupported or the ' +
            'sample repository has a single tag.',
        );
      }
    } catch (error) {
      this.options.logger?.debug(`pagination probe failed: ${String(error)}`);
    }
  }

  /**
   * Referrers determine whether build-time content manifests are reachable cheaply —
   * the difference between two HTTP calls and pulling a multi-gigabyte image.
   */
  private async probeReferrers(
    capabilities: BackendCapabilities,
    repository: string,
  ): Promise<void> {
    try {
      const tags = this.client.listTags(repository, 1);
      const firstTag = await tags.next();
      await tags.return?.(undefined);
      if (firstTag.done || !firstTag.value) {
        capabilities.notes.push(
          `Sample repository ${repository} has no tags; referrers not probed.`,
        );
        return;
      }

      const head = await this.client.headManifest(repository, firstTag.value);
      if (!head.digest) {
        capabilities.notes.push(
          'Registry did not return Docker-Content-Digest; referrers not probed.',
        );
        return;
      }

      const { via } = await this.client.getReferrers(repository, head.digest);
      capabilities.referrers = via;
      if (via === 'none') {
        capabilities.notes.push(
          'No referrers support detected: build-time content manifests are not ' +
            'reachable and enumeration must fall back to labels or blob inspection.',
        );
      }
    } catch (error) {
      this.options.logger?.debug(`referrers probe failed: ${String(error)}`);
      capabilities.notes.push('Referrers probe failed; assuming unsupported.');
    }
  }
}

/** Convenience: probe a connection in one call. */
export async function probeRegistry(
  connection: RegistryConnection,
  client: OCIClient,
  options: ProbeOptions = {},
): Promise<BackendCapabilities> {
  const sampleRepository =
    options.sampleRepository ?? connection.repositories?.[0];
  return new CapabilityProbe(client, { ...options, sampleRepository }).probe();
}
