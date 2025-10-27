import { Config } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';

import { AnsibleConfig, CatalogConfig } from '../../types';

export function getAnsibleConfig(config: Config): AnsibleConfig {
  const ansibleConfig = config.getConfig('ansible');
  const integrations = ScmIntegrations.fromConfig(config);
  const githubIntegration = integrations.github.list()[0]?.config;
  const gitlabIntegration = integrations.gitlab.list()[0]?.config;
  const ansibleConfigVales: AnsibleConfig = {
    analytics: {
      enabled: ansibleConfig.getOptionalBoolean('analytics.enabled') ?? false,
    },
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
    creatorService: ansibleConfig.has('creatorService')
      ? {
          baseUrl:
            ansibleConfig.getOptionalString('creatorService.baseUrl') ??
            'localhost',
          port:
            ansibleConfig.getOptionalString('creatorService.port') ?? '8000',
        }
      : undefined,
  };
  return ansibleConfigVales;
}

export function getCatalogConfig(rootConfig: Config): CatalogConfig {
  const catalogRhaapConfig = rootConfig.getOptionalConfig(
    'catalog.providers.rhaap',
  );
  const catalogConfig: CatalogConfig = {
    organizations: [],
    surveyEnabled: undefined,
    jobTemplateLabels: [],
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
    });
  }
  return catalogConfig;
}

function validateShowCaseType(type: string | undefined): 'url' | 'file' {
  return type === 'url' || type === 'file' ? type : 'file';
}
