import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import type { AnsibleGitContentsSourceConfig, ScmProvider } from './types';

export function readAnsibleGitContentsConfigs(
  config: Config,
): AnsibleGitContentsSourceConfig[] {
  const providerConfigs = config.getOptionalConfig('catalog.providers.rhaap');

  if (!providerConfigs) {
    console.log(
      '[AnsibleGitContentsConfig] No catalog.providers.rhaap config found',
    );
    return [];
  }

  const allSources: AnsibleGitContentsSourceConfig[] = [];
  const envKeys = providerConfigs.keys();
  console.log(
    `[AnsibleGitContentsConfig] Found environments: ${envKeys.join(', ')}`,
  );

  for (const envKey of envKeys) {
    const envConfig = providerConfigs.getConfig(envKey);

    const hasAnsibleGitContents = envConfig.has('sync.ansibleGitContents');
    console.log(
      `[AnsibleGitContentsConfig] Environment '${envKey}' has ansibleGitContents: ${hasAnsibleGitContents}`,
    );

    if (!hasAnsibleGitContents) {
      continue;
    }

    const gitContentsConfig = envConfig.getConfig('sync.ansibleGitContents');

    const providerEnabled =
      gitContentsConfig.getOptionalBoolean('enabled') ?? true;
    console.log(
      `[AnsibleGitContentsConfig] Environment '${envKey}' ansibleGitContents enabled: ${providerEnabled}`,
    );

    if (!providerEnabled) {
      console.log(
        `[AnsibleGitContentsConfig] ansibleGitContents provider is disabled in '${envKey}', skipping`,
      );
      continue;
    }

    const hasProviders = gitContentsConfig.has('providers');
    console.log(
      `[AnsibleGitContentsConfig] Environment '${envKey}' has ansibleGitContents.providers: ${hasProviders}`,
    );

    if (!hasProviders) {
      continue;
    }

    const providersConfig = gitContentsConfig.getConfig('providers');
    let commonSchedule: ReturnType<
      typeof readSchedulerServiceTaskScheduleDefinitionFromConfig
    > | null = null;
    if (gitContentsConfig.has('schedule')) {
      commonSchedule = readSchedulerServiceTaskScheduleDefinitionFromConfig(
        gitContentsConfig.getConfig('schedule'),
      );
      console.log(
        `[AnsibleGitContentsConfig] Common schedule found in '${envKey}'`,
      );
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

  console.log(
    `[AnsibleGitContentsConfig] Total sources configured: ${allSources.length}`,
  );
  return allSources;
}

type ScheduleDefinition = ReturnType<
  typeof readSchedulerServiceTaskScheduleDefinitionFromConfig
>;

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
  console.log(
    `[AnsibleGitContentsConfig] Found ${hostConfigs.length} ${scmProvider} host(s) in '${env}'`,
  );

  for (const hostConfig of hostConfigs) {
    try {
      const hostName = hostConfig.getString('name');
      const host = hostConfig.getOptionalString('host');

      if (!hostConfig.has('orgs')) {
        console.log(
          `[AnsibleGitContentsConfig] Host '${hostName}' has no orgs configured, skipping`,
        );
        continue;
      }

      const orgConfigs = hostConfig.getConfigArray('orgs');
      console.log(
        `[AnsibleGitContentsConfig] Host '${hostName}' has ${orgConfigs.length} org(s)`,
      );

      for (const orgConfig of orgConfigs) {
        const source = readOrgConfig(orgConfig, {
          scmProvider,
          hostName,
          host,
          env,
          commonSchedule,
        });
        if (source) {
          console.log(
            `[AnsibleGitContentsConfig] Parsed source: ${scmProvider}/${hostName}/${source.organization}`,
          );
          sources.push(source);
        }
      }
    } catch (error) {
      console.error(
        `[AnsibleGitContentsConfig] Error reading ${scmProvider} host config: ${error}`,
      );
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
      console.log(
        `[AnsibleGitContentsConfig] Org '${orgName}' using org-level schedule`,
      );
    } else if (context.commonSchedule) {
      schedule = context.commonSchedule;
      console.log(
        `[AnsibleGitContentsConfig] Org '${orgName}' using common schedule`,
      );
    } else {
      throw new Error(
        `No schedule defined for org '${orgName}' in host '${context.hostName}' and no common schedule available`,
      );
    }

    console.log(
      `[AnsibleGitContentsConfig] Org config: ${context.scmProvider}/${context.hostName}/${orgName}, branches=${JSON.stringify(branches)}, tags=${JSON.stringify(tags)}, crawlDepth=${crawlDepth}`,
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
    };
  } catch (error) {
    console.error(
      `[AnsibleGitContentsConfig] Error reading org config in host '${context.hostName}': ${error}`,
    );
    return null;
  }
}

export function getDefaultHost(scmProvider: ScmProvider): string {
  return scmProvider === 'github' ? 'github.com' : 'gitlab.com';
}
