export { buildCollectionsFromCatalogEntities } from './utils';
import type {
  DiscoveryService,
  AuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { getCollections } from './utils';

export function handleCollectionsAutocompleteRequest(options: {
  auth: AuthService;
  discovery: DiscoveryService;
  logger: LoggerService;
  resource?: string;
  context?: Record<string, string>;
}): Promise<{ results: any[] }> {
  return getCollections({
    auth: options.auth,
    discovery: options.discovery,
    logger: options.logger,
    searchQuery: options.context?.searchQuery,
  }).then(({ results }) => {
    const collection = results.find(
      item => item.name === options.context?.collection,
    );

    if (options.resource === 'collection_sources') {
      return {
        results: (collection?.sources ?? []).map((source: string) => ({
          name: source,
          id: source,
        })),
      };
    }

    if (options.resource === 'collection_versions') {
      const source = options.context?.source ?? '';
      const details = (collection?.versions ?? []).filter(
        item => !item.source || item.source === source,
      );
      const sourceVersions = collection?.sourceVersions?.[source] ?? [];
      if (sourceVersions.length) {
        const detailsByVersion = new Map<string, typeof details>();
        for (const detail of details) {
          const matching = detailsByVersion.get(detail.version ?? '') ?? [];
          matching.push(detail);
          detailsByVersion.set(detail.version ?? '', matching);
        }
        return {
          results: sourceVersions.flatMap(version => {
            const matches = detailsByVersion.get(version);
            return matches?.length
              ? matches.map(detail => ({
                  name: detail.label,
                  version: detail.version,
                }))
              : [{ name: version, version }];
          }),
        };
      }
      return {
        results: details.map(detail => ({
          name: detail.label,
          version: detail.version,
        })),
      };
    }

    return { results };
  });
}
