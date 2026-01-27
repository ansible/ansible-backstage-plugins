import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import {
  ScmIntegrationRegistry,
  ScmIntegrations,
} from '@backstage/integration';

import type { ScmClient } from './ScmClient';
import type { ScmProvider } from './types';
import { GithubClient } from './GithubClient';
import { GitlabClient } from './GitlabClient';

export interface CreateScmClientOptions {
  scmProvider: ScmProvider;
  host?: string;
  organization: string;
}

export class ScmClientFactory {
  private readonly integrations: ScmIntegrationRegistry;
  private readonly logger: LoggerService;

  constructor(options: { rootConfig: Config; logger: LoggerService }) {
    this.integrations = ScmIntegrations.fromConfig(options.rootConfig);
    this.logger = options.logger;
  }

  async createClient(options: CreateScmClientOptions): Promise<ScmClient> {
    const { scmProvider, host, organization } = options;

    const resolvedHost =
      host || (scmProvider === 'github' ? 'github.com' : 'gitlab.com');

    const token = this.getToken(scmProvider, resolvedHost);

    const config = {
      scmProvider,
      host: resolvedHost,
      organization,
      token,
    };

    if (scmProvider === 'github') {
      return new GithubClient({ config, logger: this.logger });
    } else if (scmProvider === 'gitlab') {
      return new GitlabClient({ config, logger: this.logger });
    }

    throw new Error(`Unsupported SCM provider: ${scmProvider}`);
  }

  private getToken(scmProvider: ScmProvider, host: string): string {
    if (scmProvider === 'github') {
      return this.getGithubToken(host);
    } else if (scmProvider === 'gitlab') {
      return this.getGitlabToken(host);
    }
    throw new Error(`Unsupported SCM provider: ${scmProvider}`);
  }

  // github token from integrations based on host
  private getGithubToken(host: string): string {
    const integration = this.integrations.github.byHost(host);
    if (!integration) {
      throw new Error(
        `No GitHub integration configured for host: ${host}. ` +
          `Please configure it in app-config.yaml under integrations.github`,
      );
    }

    const config = integration.config;
    const token = config.token;

    if (!token) {
      throw new Error(
        `No token configured for GitHub host: ${host}. ` +
          `Please add a token to the GitHub integration in app-config.yaml`,
      );
    }

    this.logger.debug(
      `[ScmClientFactory] Using GitHub integration for host: ${host}`,
    );
    return token;
  }

  // gitlab token from integrations based on host
  private getGitlabToken(host: string): string {
    const integration = this.integrations.gitlab.byHost(host);
    if (!integration) {
      throw new Error(
        `No GitLab integration configured for host: ${host}. ` +
          `Please configure it in app-config.yaml under integrations.gitlab`,
      );
    }

    const config = integration.config;
    const token = config.token;

    if (!token) {
      throw new Error(
        `No token configured for GitLab host: ${host}. ` +
          `Please add a token to the GitLab integration in app-config.yaml`,
      );
    }

    this.logger.debug(
      `[ScmClientFactory] Using GitLab integration for host: ${host}`,
    );
    return token;
  }
}
