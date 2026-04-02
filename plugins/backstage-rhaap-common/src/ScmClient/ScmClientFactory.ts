import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrationRegistry,
  ScmIntegrations,
} from '@backstage/integration';

import type { ScmClient } from './ScmClient';
import type { ScmProvider } from './types';
import { GithubClient } from './GithubClient';
import { GitlabClient } from './GitlabClient';
import { resolveGithubToken } from './resolveGithubToken';

export interface CreateScmClientOptions {
  scmProvider: ScmProvider;
  host?: string;
  organization: string;
  /**
   * GitHub only: when set, credentials (GitHub App installation) are resolved for this repo URL.
   * Omit for org-wide operations (e.g. catalog crawl).
   */
  repository?: string;
  checkSSL?: boolean;
  token?: string;
}

export class ScmClientFactory {
  readonly integrations: ScmIntegrationRegistry;
  readonly githubCredentialsProvider: DefaultGithubCredentialsProvider;
  private readonly logger: LoggerService;

  constructor(options: { rootConfig: Config; logger: LoggerService }) {
    this.integrations = ScmIntegrations.fromConfig(options.rootConfig);
    this.githubCredentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(this.integrations);
    this.logger = options.logger;
  }

  async createClient(options: CreateScmClientOptions): Promise<ScmClient> {
    const {
      scmProvider,
      host,
      organization,
      repository,
      checkSSL,
      token: providedToken,
    } = options;

    const resolvedHost =
      host || (scmProvider === 'github' ? 'github.com' : 'gitlab.com');

    if (scmProvider === 'github') {
      const { token: resolvedToken, apiBaseUrl } =
        await this.resolveGithubCredentials(
          resolvedHost,
          organization,
          repository,
          !!providedToken,
        );
      const token = providedToken || resolvedToken;

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
        // Scaffolder USER_OAUTH_TOKEN is an OAuth access token; GitLab expects Bearer, not PRIVATE-TOKEN.
        gitlabUseBearerAuth: Boolean(providedToken),
      };
      return new GitlabClient({ config, logger: this.logger });
    }

    throw new Error(`Unsupported SCM provider: ${scmProvider}`);
  }

  private async resolveGithubCredentials(
    host: string,
    organization: string,
    repository?: string,
    hasProvidedToken: boolean = false,
  ): Promise<{ token: string; apiBaseUrl?: string }> {
    try {
      return await resolveGithubToken({
        integrations: this.integrations,
        credentialsProvider: this.githubCredentialsProvider,
        logger: this.logger,
        host,
        organization,
        repository,
      });
    } catch (err) {
      if (hasProvidedToken) {
        this.logger.warn(
          `[ScmClientFactory] GitHub credential resolution failed for host: ${host}, but using provided token`,
        );
        const integration = this.integrations.github.byHost(host);
        return { token: '', apiBaseUrl: integration?.config.apiBaseUrl };
      }
      throw err;
    }
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
