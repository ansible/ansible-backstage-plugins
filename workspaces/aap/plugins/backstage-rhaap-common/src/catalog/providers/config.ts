/* eslint-disable no-console */
// Config reader utilities — no Backstage logger available at this layer;
// console.log is used intentionally for provider-configuration diagnostics.
import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { resolveActiveOrganizations } from '@ansible/backstage-rhaap-common';
import type { AapConfig, PAHRepositoryConfig } from './types';
import { getResolvedCatalogProvidersConfig } from '../catalogProviderConfig';

export function readAapApiEntityConfigs(
  config: Config,
  syncEntity: string,
): AapConfig[] {
  const providerConfigs = getResolvedCatalogProvidersConfig(config);
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
  const multiOrgEnabled =
    catalogConfig.getOptionalBoolean('multiOrgEnabled') ?? false;

  const organizations = resolveActiveOrganizations(catalogConfig);

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

  let pahRepositories: PAHRepositoryConfig[] = [];
  if (syncEntity === 'pahCollections') {
    if (catalogConfig.has(`sync.${syncEntity}.repositories`)) {
      const entries =
        catalogConfig.getOptionalConfigArray(
          `sync.${syncEntity}.repositories`,
        ) ?? [];
      pahRepositories = entries.map(entry => ({
        name: entry.getString('name'),
        schedule: entry.has('schedule')
          ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
              entry.getConfig('schedule'),
            )
          : schedule,
      }));
    }
  }

  return {
    id,
    baseUrl,
    token,
    checkSSL,
    schedule,
    multiOrgEnabled,
    organizations,
    surveyEnabled,
    jobTemplateLabels,
    jobTemplateExcludeLabels,
    pahRepositories,
  };
}
