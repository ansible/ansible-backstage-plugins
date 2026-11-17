export { buildCollectionsFromCatalogEntities } from './utils';
import type {
  BackstageCredentials,
  DiscoveryService,
  AuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { getCollections } from './utils';

export function handleCollectionsAutocompleteRequest(options: {
  auth: AuthService;
  discovery: DiscoveryService;
  logger: LoggerService;
  callerCredentials: BackstageCredentials;
  context?: Record<string, string>;
}): Promise<{ results: any[] }> {
  return getCollections({
    auth: options.auth,
    discovery: options.discovery,
    logger: options.logger,
    callerCredentials: options.callerCredentials,
    searchQuery: options.context?.searchQuery,
    identityToken: options.context?.backstageIdentityToken,
  });
}
