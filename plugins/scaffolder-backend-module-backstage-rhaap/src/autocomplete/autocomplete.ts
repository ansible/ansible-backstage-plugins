import { Config } from '@backstage/config';
import {
  AuthService,
  DiscoveryService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import {
  IAAPService,
  getAnsibleConfig,
  getVerbosityLevels,
} from '@ansible/backstage-rhaap-common';
import { getCollections } from './utils';

export async function handleAutocompleteRequest({
  resource,
  token,
  context,
  config,
  logger,
  ansibleService,
  auth,
  discovery,
}: {
  resource: string;
  token: string;
  context?: Record<string, string>;
  config: Config;
  logger: LoggerService;
  ansibleService: IAAPService;
  auth: AuthService;
  discovery: DiscoveryService;
}): Promise<{ results: any[] }> {
  const ansibleConfig = getAnsibleConfig(config);

  if (context) {
    logger.debug(`Autocomplete context for ${resource}:`, context);
  }

  if (resource === 'verbosity') {
    return { results: getVerbosityLevels() };
  }
  if (resource === 'aaphostname') {
    return {
      results: [{ id: 1, name: ansibleConfig.rhaap?.baseUrl }],
    };
  }
  if (resource === 'collections') {
    return getCollections({
      auth,
      discovery,
      logger,
      searchQuery: context?.searchQuery,
    });
  }

  await ansibleService.setLogger(logger);
  const data = await ansibleService.getResourceData(resource, token);
  return { results: data.results };
}
