import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';

import type {
  AapConfig,
  PAHRepositoryConfig,
  AnsibleGitContentsSourceConfig,
  ScmProvider,
} from './types';

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

  let pahRepositories: PAHRepositoryConfig[] = [];
  if (syncEntity === 'pahCollections') {
    if (catalogConfig.has(`sync.${syncEntity}.repositories`)) {
      const entries =
        catalogConfig.getOptionalConfigArray(
          `sync.${syncEntity}.repositories`,
        ) ?? [];
      pahRepositories = entries.map(entry => ({
        name: entry.getString('name'),
        // Use repository-specific schedule if provided, otherwise fall back to top-level schedule
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
    organizations,
    surveyEnabled,
    jobTemplateLabels,
    jobTemplateExcludeLabels,
    pahRepositories,
  };
}

type ScheduleDefinition = ReturnType<
  typeof readSchedulerServiceTaskScheduleDefinitionFromConfig
>;

export function readAnsibleGitContentsConfigs(
  config: Config,
): AnsibleGitContentsSourceConfig[] {
  const providerConfigs = config.getOptionalConfig('catalog.providers.rhaap');

  if (!providerConfigs) {
    console.log('No catalog.providers.rhaap config found');
    return [];
  }

  const allSources: AnsibleGitContentsSourceConfig[] = [];
  const envKeys = providerConfigs.keys();
  console.log(`Found environments: ${envKeys.join(', ')}`);

  for (const envKey of envKeys) {
    const envConfig = providerConfigs.getConfig(envKey);

    const hasAnsibleGitContents = envConfig.has('sync.ansibleGitContents');
    console.log(
      `Environment '${envKey}' has ansibleGitContents: ${hasAnsibleGitContents}`,
    );

    if (!hasAnsibleGitContents) {
      continue;
    }

    const gitContentsConfig = envConfig.getConfig('sync.ansibleGitContents');

    const providerEnabled =
      gitContentsConfig.getOptionalBoolean('enabled') ?? true;
    console.log(
      `Environment '${envKey}' ansibleGitContents enabled: ${providerEnabled}`,
    );

    if (!providerEnabled) {
      console.log(
        `AnsibleGitContents provider is disabled in '${envKey}', skipping`,
      );
      continue;
    }

    const hasProviders = gitContentsConfig.has('providers');
    console.log(
      `Environment '${envKey}' has ansibleGitContents.providers: ${hasProviders}`,
    );

    if (!hasProviders) {
      continue;
    }

    const providersConfig = gitContentsConfig.getConfig('providers');

    let commonSchedule: ScheduleDefinition | null = null;
    if (gitContentsConfig.has('schedule')) {
      commonSchedule = readSchedulerServiceTaskScheduleDefinitionFromConfig(
        gitContentsConfig.getConfig('schedule'),
      );
      console.log(`Common schedule found in '${envKey}'`);
    }

    const sources = processScmProviders(
      providersConfig,
      'github',
      envKey,
      commonSchedule,
    );
    allSources.push(...sources);

    const gitlabSources = processScmProviders(
      providersConfig,
      'gitlab',
      envKey,
      commonSchedule,
    );
    allSources.push(...gitlabSources);
  }

  console.log(`Total sources configured: ${allSources.length}`);
  return allSources;
}

function processScmProviders(
  providersConfig: Config,
  scmProvider: ScmProvider,
  env: string,
  commonSchedule: ScheduleDefinition | null,
): AnsibleGitContentsSourceConfig[] {
  const sources: AnsibleGitContentsSourceConfig[] = [];

  if (!providersConfig.has(scmProvider)) {
    return sources;
  }

  const hostConfigs = providersConfig.getConfigArray(scmProvider);
  console.log(`Found ${hostConfigs.length} ${scmProvider} host(s) in '${env}'`);

  for (const hostConfig of hostConfigs) {
    try {
      const hostName = hostConfig.getString('name');
      const host = hostConfig.getOptionalString('host');
      const checkSSL = hostConfig.getOptionalBoolean('checkSSL');

      if (!hostConfig.has('orgs')) {
        console.log(`Host '${hostName}' has no orgs configured, skipping`);
        continue;
      }

      const orgConfigs = hostConfig.getConfigArray('orgs');
      console.log(`Host '${hostName}' has ${orgConfigs.length} org(s)`);

      for (const orgConfig of orgConfigs) {
        const source = readOrgConfig(orgConfig, {
          scmProvider,
          hostName,
          host,
          checkSSL,
          env,
          commonSchedule,
        });
        if (source) {
          console.log(
            `Parsed source: ${scmProvider}/${hostName}/${source.organization}`,
          );
          sources.push(source);
        }
      }
    } catch (error) {
      console.error(`Error reading ${scmProvider} host config: ${error}`);
    }
  }

  return sources;
}

function readOrgConfig(
  config: Config,
  context: {
    scmProvider: ScmProvider;
    hostName: string;
    host?: string;
    checkSSL?: boolean;
    env: string;
    commonSchedule: ScheduleDefinition | null;
  },
): AnsibleGitContentsSourceConfig | null {
  try {
    const orgName = config.getString('name');

    const branches = config.getOptionalStringArray('branches');
    const tags = config.getOptionalStringArray('tags');
    const galaxyFilePaths = config.getOptionalStringArray('galaxyFilePaths');
    const crawlDepth = config.getOptionalNumber('crawlDepth') ?? 5;

    let schedule: ScheduleDefinition;
    if (config.has('schedule')) {
      schedule = readSchedulerServiceTaskScheduleDefinitionFromConfig(
        config.getConfig('schedule'),
      );
      console.log(`Org '${orgName}' using org-level schedule`);
    } else if (context.commonSchedule) {
      schedule = context.commonSchedule;
      console.log(`Org '${orgName}' using common schedule (fallback)`);
    } else {
      throw new Error(
        `No schedule defined for org '${orgName}' in host '${context.hostName}' and no common schedule available`,
      );
    }

    console.log(
      `Org config: ${context.scmProvider}/${context.hostName}/${orgName}, branches=${JSON.stringify(branches)}, tags=${JSON.stringify(tags)}, crawlDepth=${crawlDepth}`,
    );

    return {
      enabled: true,
      scmProvider: context.scmProvider,
      hostName: context.hostName,
      host: context.host,
      organization: orgName,
      branches,
      tags,
      galaxyFilePaths,
      crawlDepth,
      schedule,
      env: context.env,
      checkSSL: context.checkSSL,
    };
  } catch (error) {
    console.error(
      `Error reading org config in host '${context.hostName}': ${error}`,
    );
    return null;
  }
}

export function getDefaultHost(scmProvider: ScmProvider): string {
  return scmProvider === 'github' ? 'github.com' : 'gitlab.com';
}
