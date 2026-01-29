import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import type { AnsibleCollectionSourceConfig, ScmProvider } from './types';

export function readAnsibleCollectionConfigs(
  config: Config,
): AnsibleCollectionSourceConfig[] {
  const providerConfigs = config.getOptionalConfig('catalog.providers.rhaap');

  if (!providerConfigs) {
    console.log(
      '[AnsibleCollectionConfig] No catalog.providers.rhaap config found',
    );
    return [];
  }

  const allSources: AnsibleCollectionSourceConfig[] = [];
  const envKeys = providerConfigs.keys();
  console.log(
    `[AnsibleCollectionConfig] Found environments: ${envKeys.join(', ')}`,
  );

  for (const envKey of envKeys) {
    const envConfig = providerConfigs.getConfig(envKey);

    const hasAnsibleCollections = envConfig.has(
      'sync.ansibleCollections.sources',
    );
    console.log(
      `[AnsibleCollectionConfig] Environment '${envKey}' has ansibleCollections.sources: ${hasAnsibleCollections}`,
    );

    if (!hasAnsibleCollections) {
      continue;
    }

    const sourcesConfig = envConfig.getConfigArray(
      'sync.ansibleCollections.sources',
    );
    console.log(
      `[AnsibleCollectionConfig] Found ${sourcesConfig.length} sources in '${envKey}'`,
    );

    for (const sourceConfig of sourcesConfig) {
      const source = readSourceConfig(sourceConfig);
      if (source) {
        console.log(
          `[AnsibleCollectionConfig] Parsed source: ${source.scmProvider}/${source.organization}`,
        );
        allSources.push(source);
      }
    }
  }

  return allSources;
}

function readSourceConfig(
  config: Config,
): AnsibleCollectionSourceConfig | null {
  try {
    const scmProvider = config.getString('scmProvider') as ScmProvider;
    const organization = config.getString('organization');

    if (!['github', 'gitlab'].includes(scmProvider)) {
      throw new Error(
        `Invalid scmProvider: ${scmProvider}. Must be 'github' or 'gitlab'.`,
      );
    }

    const enabled = config.getOptionalBoolean('enabled') ?? true;
    const host = config.getOptionalString('host');
    const branches = config.getOptionalStringArray('branches');
    const tags = config.getOptionalStringArray('tags');
    const galaxyFilePaths = config.getOptionalStringArray('galaxyFilePaths');
    const crawlDepth = config.getOptionalNumber('crawlDepth') ?? 5;

    if (!config.has('schedule')) {
      throw new Error('Schedule is required for Ansible collection source');
    }
    const schedule = readSchedulerServiceTaskScheduleDefinitionFromConfig(
      config.getConfig('schedule'),
    );

    console.log(
      `[AnsibleCollectionConfig] Source config: scmProvider=${scmProvider}, org=${organization}, branches=${JSON.stringify(branches)}, tags=${JSON.stringify(tags)}, crawlDepth=${crawlDepth}`,
    );

    return {
      enabled,
      scmProvider,
      host,
      organization,
      branches,
      tags,
      galaxyFilePaths,
      crawlDepth,
      schedule,
    };
  } catch (error) {
    console.error(
      `[AnsibleCollectionProvider] Error reading source config: ${error}`,
    );
    return null;
  }
}
