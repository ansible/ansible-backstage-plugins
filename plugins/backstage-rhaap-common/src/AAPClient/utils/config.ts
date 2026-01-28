import { Config } from '@backstage/config';
import {
  ScmIntegrations,
  GithubIntegrationConfig,
  GitLabIntegrationConfig,
} from '@backstage/integration';

import { AnsibleConfig, CatalogConfig } from '../../types';

export function getAnsibleConfig(config: Config): AnsibleConfig {
  const ansibleConfig = config.getConfig('ansible');
  const integrations = ScmIntegrations.fromConfig(config);

  // Get all configured integrations (supports multiple hosts)
  const githubIntegrations = integrations.github.list().map(i => i.config);
  const gitlabIntegrations = integrations.gitlab.list().map(i => i.config);

  // Keep first for backward compatibility
  const githubIntegration = githubIntegrations[0];
  const gitlabIntegration = gitlabIntegrations[0];

  const ansibleConfigVales: AnsibleConfig = {
    devSpaces: {
      baseUrl: ansibleConfig.getOptionalString('devSpaces.baseUrl'),
    },
    automationHub: {
      baseUrl: ansibleConfig.getOptionalString('automationHub.baseUrl'),
    },
    rhaap: {
      baseUrl: ansibleConfig.getOptionalString('rhaap.baseUrl'),
      token: ansibleConfig.getOptionalString('rhaap.token'),
      checkSSL: ansibleConfig.getOptionalBoolean('rhaap.checkSSL') ?? true,
      showCaseLocation: {
        type: validateShowCaseType(
          ansibleConfig.getOptionalString('rhaap.showCaseLocation.type'),
        ),
        target: ansibleConfig.getOptionalString(
          'rhaap.showCaseLocation.target',
        ),
        gitBranch: ansibleConfig.getOptionalString(
          'rhaap.showCaseLocation.gitBranch',
        ),
        gitUser: ansibleConfig.getOptionalString(
          'rhaap.showCaseLocation.gitUser',
        ),
        gitEmail: ansibleConfig.getOptionalString(
          'rhaap.showCaseLocation.gitEmail',
        ),
      },
    },
    githubIntegration,
    gitlabIntegration,
    githubIntegrations,
    gitlabIntegrations,
    creatorService: ansibleConfig.has('creatorService')
      ? {
          baseUrl:
            ansibleConfig.getOptionalString('creatorService.baseUrl') ??
            'localhost',
          port:
            ansibleConfig.getOptionalString('creatorService.port') ?? '8000',
        }
      : undefined,
    feedback: {
      enabled: ansibleConfig.getOptionalBoolean('feedback.enabled') ?? false,
    },
  };
  return ansibleConfigVales;
}

/**
 * Lookup a specific SCM integration by host name.
 * Searches both GitHub and GitLab integrations.
 *
 * @param ansibleConfig - The AnsibleConfig object containing all integrations
 * @param host - The host to look up (e.g., 'github.com', 'ghe.example.net', 'gitlab.com')
 * @returns The matching integration config, or undefined if not found
 */
export function getIntegrationByHost(
  ansibleConfig: AnsibleConfig,
  host: string,
): GithubIntegrationConfig | GitLabIntegrationConfig | undefined {
  const github = ansibleConfig.githubIntegrations?.find(i => i.host === host);
  if (github) return github;
  return ansibleConfig.gitlabIntegrations?.find(i => i.host === host);
}

export function getCatalogConfig(rootConfig: Config): CatalogConfig {
  const catalogRhaapConfig = rootConfig.getOptionalConfig(
    'catalog.providers.rhaap',
  );
  const catalogConfig: CatalogConfig = {
    organizations: [],
    surveyEnabled: undefined,
    jobTemplateLabels: [],
    jobTemplateExcludeLabels: [],
  };
  if (catalogRhaapConfig && typeof catalogRhaapConfig.keys === 'function') {
    catalogRhaapConfig.keys().forEach(key => {
      const config = catalogRhaapConfig.getConfig(key);
      try {
        catalogConfig.organizations = config
          .getString('orgs')
          .split(',')
          .map(o => o.toLocaleLowerCase());
      } catch (error) {
        catalogConfig.organizations = config
          .getStringArray('orgs')
          .map(o => o.toLocaleLowerCase());
      }
      catalogConfig.surveyEnabled = config.getOptionalBoolean(
        `sync.jobTemplates.surveyEnabled`,
      );
      catalogConfig.jobTemplateLabels =
        config.getOptionalStringArray(`sync.jobTemplates.labels`) ?? [];
      catalogConfig.jobTemplateExcludeLabels =
        config.getOptionalStringArray(`sync.jobTemplates.excludeLabels`) ?? [];
    });
  }
  return catalogConfig;
}

function validateShowCaseType(type: string | undefined): 'url' | 'file' {
  return type === 'url' || type === 'file' ? type : 'file';
}
