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

  // Return all configured SCM integrations (GitHub and GitLab hosts)
  if (resource === 'scm_integrations') {
    const results = [
      ...(ansibleConfig.githubIntegrations || []).map((cfg, idx) => ({
        id: `github-${idx}`,
        host: cfg.host,
        type: 'github',
        name: cfg.host,
      })),
      ...(ansibleConfig.gitlabIntegrations || []).map((cfg, idx) => ({
        id: `gitlab-${idx}`,
        host: cfg.host,
        type: 'gitlab',
        name: cfg.host,
      })),
    ];
    return { results };
  }

  await ansibleService.setLogger(logger);
  const data = await ansibleService.getResourceData(resource, token);
  return { results: data.results };
}
