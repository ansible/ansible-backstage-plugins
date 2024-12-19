import { Config } from '@backstage/config';

import { LoggerService } from '@backstage/backend-plugin-api';
import { AAPApiClient } from '../actions/helpers';
import { getAnsibleConfig } from '../config-reader';

export async function handleAutocompleteRequest({
  resource,
  token,
  config,
  logger,
}: {
  resource: string;
  token: string;
  config: Config;
  logger: LoggerService;
}): Promise<{ results: any[] }> {
  const ansibleConfig = getAnsibleConfig(config);
  if (resource === 'verbosity') {
    const data = [
      '0 (Normal)',
      '1 (Verbose)',
      '2 (More Verbose)',
      '3 (Debug)',
      '4 (Connection Debug)',
      '5 (WinRM Debug)',
    ];
    return {
      results: data.map((value, index) => {
        return { id: index, name: value };
      }),
    };
  }
  const apiClient = new AAPApiClient({ ansibleConfig, logger, token });
  const data = await apiClient.getResourceData(resource);
  return { results: data.results };
}
