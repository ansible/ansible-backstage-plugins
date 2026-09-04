import { Config } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';

import { AnsibleConfig, CatalogConfig } from '../../types';

export function getAnsibleConfig(config: Config): AnsibleConfig {
  const ansibleConfig = config.getConfig('ansible');
  const integrations = ScmIntegrations.fromConfig(config);
  const githubIntegration = integrations.github.list()[0]?.config;
  const gitlabIntegration = integrations.gitlab.list()[0]?.config;
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
      catalogConfig.organizations = resolveActiveOrganizations(config);
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

function resolveOrganizations(config: Config): string[] {
  let allOrgs: string[] = [];
  if (typeof config.has === 'function' && !config.has('orgs')) {
    return ['default'];
  }
  try {
    allOrgs = config
      .getString('orgs')
      .split(',')
      .map(o => o.trim().toLowerCase())
      .filter(o => o.length > 0);
  } catch {
    try {
      allOrgs = config
        .getStringArray('orgs')
        .map(o => o.trim().toLowerCase())
        .filter(o => o.length > 0);
    } catch {
      // orgs is missing or invalid — fall through to default
    }
  }
  return allOrgs.length > 0 ? allOrgs : ['default'];
}

/** Resolve orgs for runtime use, honoring multiOrgEnabled single-org mode. */
export function resolveActiveOrganizations(config: Config): string[] {
  const allOrgs = resolveOrganizations(config);
  const multiOrgEnabled = config.getOptionalBoolean('multiOrgEnabled') ?? false;
  return multiOrgEnabled ? allOrgs : [allOrgs[0]];
}
