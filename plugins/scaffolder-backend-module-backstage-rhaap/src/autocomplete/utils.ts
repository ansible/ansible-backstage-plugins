import {
  AuthService,
  DiscoveryService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import type { Collections } from '@ansible/backstage-rhaap-common';

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

export function buildCollectionsFromCatalogEntities(
  entities: any[],
): Collections[] {
  const map = new Map<string, Collections>();

  for (const item of entities) {
    const name =
      item.spec?.collection_full_name ??
      `${item.spec?.collection_namespace}.${item.spec?.collection_name}`;

    if (!name) continue;

    const version = item.spec?.collection_version;
    const annotations = item.metadata?.annotations || {};
    const source = formatSource(annotations);

    if (!map.has(name)) {
      map.set(name, {
        name,
        versions: [],
        sources: [],
        sourceVersions: {},
      });
    }

    const collection = map.get(name)!;

    if (version && !collection.versions!.includes(version)) {
      collection.versions!.push(version);
    }
    if (source) {
      if (!collection.sourceVersions![source]) {
        collection.sourceVersions![source] = [];
      }
      if (version && !collection.sourceVersions![source].includes(version)) {
        collection.sourceVersions![source].push(version);
      }
      if (!collection.sources!.includes(source)) {
        collection.sources!.push(source);
      }
    }
  }

  return Array.from(map.values());
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
