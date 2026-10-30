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
  context?: Record<string, string>;
}): Promise<{ results: any[] }> {
  return getCollections({
    auth: options.auth,
    discovery: options.discovery,
    logger: options.logger,
    searchQuery: options.context?.searchQuery,
  });
}

