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
  checkSSL?: boolean;
  token?: string;
}

export class ScmClientFactory {
  private readonly integrations: ScmIntegrationRegistry;
  private readonly logger: LoggerService;

  constructor(options: { rootConfig: Config; logger: LoggerService }) {
    this.integrations = ScmIntegrations.fromConfig(options.rootConfig);
    this.logger = options.logger;
  }

  async createClient(options: CreateScmClientOptions): Promise<ScmClient> {
    const {
      scmProvider,
      host,
      organization,
      checkSSL,
      token: providedToken,
    } = options;

    const resolvedHost =
      host || (scmProvider === 'github' ? 'github.com' : 'gitlab.com');

    if (scmProvider === 'github') {
      const { token: configToken, apiBaseUrl } = this.getGithubConfig(
        resolvedHost,
        !!providedToken,
      );
      const token = providedToken || configToken;

      if (providedToken) {
        this.logger.info(
          `[ScmClientFactory] Using provided OAuth token for GitHub host: ${resolvedHost}`,
        );
      }

      const config = {
        scmProvider,
        host: resolvedHost,
        organization,
        token,
        apiBaseUrl,
        checkSSL,
      };
      return new GithubClient({ config, logger: this.logger });
    }

    if (scmProvider === 'gitlab') {
      const { token: configToken, apiBaseUrl } = this.getGitlabConfig(
        resolvedHost,
        !!providedToken,
      );
      const token = providedToken || configToken;

      if (providedToken) {
        this.logger.info(
          `[ScmClientFactory] Using provided OAuth token for GitLab host: ${resolvedHost}`,
        );
      }

      const config = {
        scmProvider,
        host: resolvedHost,
        organization,
        token,
        apiBaseUrl,
        checkSSL,
      };
      return new GitlabClient({ config, logger: this.logger });
    }

    throw new Error(`Unsupported SCM provider: ${scmProvider}`);
  }

  private getGithubConfig(
    host: string,
    hasProvidedToken: boolean = false,
  ): {
    token: string;
    apiBaseUrl?: string;
  } {
    const integration = this.integrations.github.byHost(host);
    if (!integration) {
      if (hasProvidedToken) {
        this.logger.warn(
          `[ScmClientFactory] No GitHub integration configured for host: ${host}, but using provided token`,
        );
        return { token: '' };
      }
      throw new Error(
        `No GitHub integration configured for host: ${host}. ` +
          `Please configure it in app-config.yaml under integrations.github`,
      );
    }

    const config = integration.config;
    const token = config.token;

    if (!token && !hasProvidedToken) {
      throw new Error(
        `No token configured for GitHub host: ${host}. ` +
          `Please add a token to the GitHub integration in app-config.yaml`,
      );
    }

    this.logger.debug(
      `[ScmClientFactory] Using GitHub integration for host: ${host}`,
    );
    return {
      token: token || '',
      apiBaseUrl: config.apiBaseUrl,
    };
  }

  private getGitlabConfig(
    host: string,
    hasProvidedToken: boolean = false,
  ): {
    token: string;
    apiBaseUrl?: string;
  } {
    const integration = this.integrations.gitlab.byHost(host);
    if (!integration) {
      if (hasProvidedToken) {
        this.logger.warn(
          `[ScmClientFactory] No GitLab integration configured for host: ${host}, but using provided token`,
        );
        return { token: '' };
      }
      throw new Error(
        `No GitLab integration configured for host: ${host}. ` +
          `Please configure it in app-config.yaml under integrations.gitlab`,
      );
    }

    const config = integration.config;
    const token = config.token;

    if (!token && !hasProvidedToken) {
      throw new Error(
        `No token configured for GitLab host: ${host}. ` +
          `Please add a token to the GitLab integration in app-config.yaml`,
      );
    }

    this.logger.debug(
      `[ScmClientFactory] Using GitLab integration for host: ${host}`,
    );
    return {
      token: token || '',
      apiBaseUrl: config.apiBaseUrl,
    };
  }
}
