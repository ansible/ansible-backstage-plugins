import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  IAAPService,
  getAnsibleConfig,
  getVerbosityLevels,
} from '@ansible/backstage-rhaap-common';

export async function handleAutocompleteRequest({
  resource,
  token,
  context,
  config,
  logger,
  ansibleService,
}: {
  resource: string;
  token: string;
  context?: Record<string, string>;
  config: Config;
  logger: LoggerService;
  ansibleService: IAAPService;
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
    return {
      results: await ansibleService.getCollections(
        context?.searchQuery || '',
        token,
      ),
    };
  }
  await ansibleService.setLogger(logger);
  const data = await ansibleService.getResourceData(resource, token);
  return { results: data.results };
}
