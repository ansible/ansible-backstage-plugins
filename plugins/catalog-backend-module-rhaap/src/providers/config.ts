import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';

import type { AapConfig } from './types';

export function readAapApiEntityConfigs(config: Config): AapConfig[] {
  const providerConfigs = config.getOptionalConfig('catalog.providers.rhaap');
  if (!providerConfigs) {
    return [];
  }
  return providerConfigs
    .keys()
    .map(id =>
      readAapApiEntityConfig(id, config, providerConfigs.getConfig(id)),
    );
}

function readAapApiEntityConfig(
  id: string,
  config: Config,
  catalogConfig: Config,
): AapConfig {
  const baseUrl = config.getString('ansible.rhaap.baseUrl');
  const token = config.getString('ansible.rhaap.token');
  const checkSSL = config.getBoolean('ansible.rhaap.checkSSL') ?? true;
  const schedule = catalogConfig.has('schedule')
    ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
        catalogConfig.getConfig('schedule'),
      )
    : undefined;
  const orgSync = catalogConfig.has('orgs')
    ? catalogConfig.getString('orgs')
    : '';

  return {
    id,
    baseUrl,
    token,
    checkSSL,
    schedule,
    orgSync,
  };
}
