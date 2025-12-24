import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';

import type { AapConfig } from './types';

export function readAapApiEntityConfigs(
  config: Config,
  syncEntity: string,
): AapConfig[] {
  const providerConfigs = config.getOptionalConfig('catalog.providers.rhaap');
  if (!providerConfigs) {
    return [];
  }
  return providerConfigs
    .keys()
    .map(id => {
      const catalogConfig = providerConfigs.getConfig(id);
      if (
        catalogConfig.has(`sync.${syncEntity}.enabled`) &&
        !catalogConfig.getBoolean(`sync.${syncEntity}.enabled`)
      )
        return null;
      return readAapApiEntityConfig(id, config, catalogConfig, syncEntity);
    })
    .filter(c => !!c);
}

function readAapApiEntityConfig(
  id: string,
  config: Config,
  catalogConfig: Config,
  syncEntity: string,
): AapConfig {
  const baseUrl = config.getString('ansible.rhaap.baseUrl');
  const token = config.getString('ansible.rhaap.token');
  const checkSSL = config.getBoolean('ansible.rhaap.checkSSL') ?? true;
  const schedule = catalogConfig.has(`sync.${syncEntity}.schedule`)
    ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
        catalogConfig.getConfig(`sync.${syncEntity}.schedule`),
      )
    : undefined;
  let organizations: string[] = [];
  try {
    if (catalogConfig.has('orgs'))
      organizations = catalogConfig
        .getString('orgs')
        .split(',')
        .map(o => o.toLocaleLowerCase());
  } catch (error) {
    organizations = catalogConfig
      .getStringArray('orgs')
      .map(o => o.toLocaleLowerCase());
  }
  let surveyEnabled: boolean | undefined = undefined;
  let jobTemplateLabels: string[] = [];
  let jobTemplateExcludeLabels: string[] = [];

  if (syncEntity === 'jobTemplates') {
    if (catalogConfig.has(`sync.${syncEntity}.surveyEnabled`)) {
      surveyEnabled = catalogConfig.getOptionalBoolean(
        `sync.${syncEntity}.surveyEnabled`,
      );
    }
    if (catalogConfig.has(`sync.${syncEntity}.labels`)) {
      jobTemplateLabels =
        catalogConfig.getOptionalStringArray(`sync.${syncEntity}.labels`) ?? [];
    }
    if (catalogConfig.has(`sync.${syncEntity}.excludeLabels`)) {
      jobTemplateExcludeLabels =
        catalogConfig.getOptionalStringArray(
          `sync.${syncEntity}.excludeLabels`,
        ) ?? [];
    }
  }

  return {
    id,
    baseUrl,
    token,
    checkSSL,
    schedule,
    organizations,
    surveyEnabled,
    jobTemplateLabels,
    jobTemplateExcludeLabels,
  };
}
