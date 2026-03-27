import {
  AuthService,
  DiscoveryService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import type {
  Collections,
  SourceVersionDetail,
} from '@ansible/backstage-rhaap-common';

function formatSource(annotations: Record<string, string>): string | null {
  const scmProvider = annotations['ansible.io/scm-provider'];
  const hostName = annotations['ansible.io/scm-host-name'];
  const organization = annotations['ansible.io/scm-organization'];
  const repository = annotations['ansible.io/scm-repository'];

  if (annotations['ansible.io/collection-source'] === 'pah') {
    const repoName =
      annotations['ansible.io/collection-source-repository'] || 'unknown';
    return `Private Automation Hub / ${repoName}`;
  }
  if (scmProvider && hostName && organization && repository) {
    const providerName =
      scmProvider.charAt(0).toUpperCase() + scmProvider.slice(1);
    return `${providerName} / ${hostName} / ${organization} / ${repository}`;
  }
  return null;
}

/**
 * Compare two version strings for descending sort (newest first).
 * Handles semver-like versions (e.g. 1.2.3, 2.0.0).
 */

function compareVersionsDescending(a: string, b: string): number {
  const parse = (v: string) => {
    const parts = v.split('.');
    return parts.map(p => {
      const num = Number.parseInt(p, 10);
      return Number.isNaN(num) ? 0 : num;
    });
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return nb - na; // descending: higher version first
  }
  return 0;
}

function compareSourceVersionDetailsDescending(
  a: SourceVersionDetail,
  b: SourceVersionDetail,
): number {
  return compareVersionsDescending(a.version ?? '', b.version ?? '');
}

export function buildCollectionsFromCatalogEntities(
  entities: any[],
): Collections[] {
  const map = new Map<string, Collections>();

  for (const item of entities) {
    const name =
      item.spec?.collection_full_name ??
      `${item.spec?.collection_namespace}.${item.spec?.collection_name}`;

    if (!name) continue;

    const specVersion = item.spec?.collection_version;
    const version: string | null =
      specVersion === undefined || specVersion === null
        ? null
        : String(specVersion);
    const annotations = item.metadata?.annotations || {};
    const source = formatSource(annotations);
    const refRaw = annotations['ansible.io/ref'];
    const ref = refRaw === undefined || refRaw === null ? '' : String(refRaw);

    if (!map.has(name)) {
      map.set(name, {
        name,
        versions: [],
        sources: [],
        sourceVersions: {},
      });
    }

    const collection = map.get(name)!;
    const versions = collection.versions ?? (collection.versions = []);
    const sources = collection.sources ?? (collection.sources = []);
    const sourceVersions =
      collection.sourceVersions ?? (collection.sourceVersions = {});

    const shouldPushDetail = (version !== null && version !== '') || ref !== '';

    if (shouldPushDetail) {
      const detail: SourceVersionDetail = {
        ref,
        version,
        label: ref && version ? `${ref} / ${version}` : `${version}`,
      };
      const isDuplicate = versions.some(
        v => v.ref === detail.ref && v.version === detail.version,
      );
      if (!isDuplicate) {
        versions.push(detail);
      }
    }

    if (source) {
      if (!sourceVersions[source]) {
        sourceVersions[source] = [];
      }
      if (version && !sourceVersions[source].includes(version)) {
        sourceVersions[source].push(version);
      }
      if (!sources.includes(source)) {
        sources.push(source);
      }
    }
  }

  const collections = Array.from(map.values());

  for (const collection of collections) {
    if (collection.versions?.length) {
      collection.versions.sort(compareSourceVersionDetailsDescending);
    }
    if (collection.sourceVersions) {
      for (const source of Object.keys(collection.sourceVersions)) {
        const vers = collection.sourceVersions[source];
        if (vers?.length) {
          collection.sourceVersions[source] = vers.sort(
            compareVersionsDescending,
          );
        }
      }
    }
  }

  collections.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
  return collections;
}

export async function getCollections(options: {
  auth: AuthService;
  discovery: DiscoveryService;
  logger: LoggerService;
  searchQuery?: string;
}): Promise<{ results: Collections[] }> {
  const { auth, discovery, logger, searchQuery } = options;
  const baseUrl = await discovery.getBaseUrl('catalog');
  const { token: catalogToken } = await auth.getPluginRequestToken({
    onBehalfOf: await auth.getOwnServiceCredentials(),
    targetPluginId: 'catalog',
  });
  const filter = encodeURIComponent(
    searchQuery ?? 'spec.type=ansible-collection',
  );
  const response = await fetch(`${baseUrl}/entities?filter=${filter}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${catalogToken}`,
    },
  });
  if (!response.ok) {
    logger.warn(
      `Catalog entities request failed: ${response.status} ${response.statusText}`,
    );
    return { results: [] };
  }
  const body = await response.json();
  const entities = Array.isArray(body) ? body : (body?.items ?? []);
  const results = buildCollectionsFromCatalogEntities(entities);
  return { results };
}
