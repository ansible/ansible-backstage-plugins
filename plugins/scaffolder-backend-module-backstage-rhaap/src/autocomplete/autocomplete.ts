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
import {
  InputError,
  NotAllowedError,
  ServiceUnavailableError,
} from '@backstage/errors';
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
}): Promise<{ results: any[]; count?: number }> {
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

  ansibleService.setLogger(logger);

  try {
    const serviceToken = ansibleConfig.rhaap?.token ?? null;
    const isControllerAvailable =
      await ansibleService.checkControllerAvailability(serviceToken ?? token);
    if (!isControllerAvailable) {
      throw new ServiceUnavailableError(
        'Controller service is absent in provided AAP instance',
      );
    }

    const data = await ansibleService.getResourceData(resource, token);
    return { results: data.results, count: data.count };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Insufficient privileges')) {
      throw new NotAllowedError(message);
    }
    if (
      message.includes('Controller') ||
      message.includes('Failed to send fetch')
    ) {
      throw new ServiceUnavailableError(message);
    }
    throw new InputError(message);
  }
}
