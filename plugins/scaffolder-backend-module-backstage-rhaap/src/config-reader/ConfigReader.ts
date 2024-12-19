import { Config } from '@backstage/config';
import { AnsibleConfig } from '../types';
import { ScmIntegrations } from '@backstage/integration';

export const getAnsibleConfig = (config: Config): AnsibleConfig => {
  const integrations = ScmIntegrations.fromConfig(config);
  const baseUrl = config.getString('ansible.rhaap.baseUrl');
  const gitHubIntegration = integrations.github.list()[0].config;
  const ansibleConfig = {
    baseUrl: baseUrl.slice(-1) === '/' ? baseUrl.slice(0, -1) : baseUrl,
    checkSSL: config.getOptionalBoolean('ansible.rhaap.checkSSL') ?? true,
    : {
      type: config.getString('ansible.rhaap..type'),
      target: config.getString('ansible.rhaap..target'),
    },
    gitHubIntegration: gitHubIntegration,
  } as AnsibleConfig;

  if (ansibleConfig..type === 'url') {
    if (!gitHubIntegration.token) {
      throw new Error('Missing GitHub token');
    }
    ansibleConfig..githubUser = config.getString(
      'ansible.rhaap..githubUser',
    );
    ansibleConfig..githubBranch = config.getString(
      'ansible.rhaap..githubBranch',
    );
    ansibleConfig..githubEmail = config.getString(
      'ansible.rhaap..githubEmail',
    );
  } else {
    if (ansibleConfig..type !== 'file') {
      throw new Error(
        "Missing required config value at 'ansible.rhaap..type'",
      );
    }
  }
  return ansibleConfig;
};
