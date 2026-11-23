/* eslint-disable no-console */
// Config reader utilities — no Backstage logger available at this layer;
// console.log is used intentionally for provider-configuration diagnostics.
import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { resolveActiveOrganizations } from '@ansible/aap-node';
import type { AapConfig, PAHRepositoryConfig } from './types';
import { getResolvedCatalogProvidersConfig } from '../catalogProviderConfig';

export function readAapApiEntityConfigs(
  config: Config,
  syncEntity: string,
  options?: { allowMissingSchedule?: boolean },
): AapConfig[] {
  const providerConfigs = getResolvedCatalogProvidersConfig(config, {
    // PAH/Git content startup must not fail on unused AAP identity settings.
    validateIdentity: syncEntity !== 'pahCollections',
  });
  if (!providerConfigs) {
    return [];
  }
  return providerConfigs
    .keys()
    .map(id => {
      const catalogConfig = providerConfigs.getConfig(id);
      const syncPath = `sync.${syncEntity}`;
      if (
        catalogConfig.has(`${syncPath}.enabled`) &&
        !catalogConfig.getBoolean(`${syncPath}.enabled`)
      )
        return null;
      // PAH connection settings are only required when repositories are configured.
      // Repository-level schedules stay valid without a top-level schedule.
      if (syncEntity === 'pahCollections') {
        const repositories = catalogConfig.getOptionalConfigArray(
          `${syncPath}.repositories`,
        );
        if (!repositories?.length) return null;
        return readAapApiEntityConfig(id, config, catalogConfig, syncEntity);
      }
      // Identity-only YAML has no sync block. Skip unless a caller-supplied
      // task runner is standing in for the schedule (legacy fromConfig hosts).
      if (!catalogConfig.has(syncPath) && !options?.allowMissingSchedule) {
        return null;
      }
      // Job templates are opt-in. A disabled block needs no schedule, and an
      // omitted schedule can still use the task runner passed to fromConfig.
      // Require a config schedule only when the block is explicitly enabled.
      const scheduleRequired =
        !options?.allowMissingSchedule &&
        (syncEntity !== 'jobTemplates' ||
          catalogConfig.getOptionalBoolean(`${syncPath}.enabled`) === true);
      if (scheduleRequired && !catalogConfig.has(`${syncPath}.schedule`)) {
        throw new InputError(
          `No schedule provided via config for ${syncPath}.schedule on catalog provider "${id}".`,
        );
      }
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
  const checkSSL = config.getOptionalBoolean('ansible.rhaap.checkSSL') ?? true;
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
