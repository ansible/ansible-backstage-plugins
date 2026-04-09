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

const WORKFLOW_DISPATCH_PLACEHOLDER_ORG = '__workflow_dispatch__';

/**
 * Builds a {@link GithubClient} for arbitrary-repo GitHub REST calls (e.g. Actions workflow_dispatch)
 * using an explicit host and token — for example integration token plus optional request Bearer fallback.
 * Does not use {@link ScmClientFactory#createClient}; organization is a placeholder and unused for dispatch.
 */
export function createGithubClientForWorkflowDispatch(options: {
  logger: LoggerService;
  host: string;
  token: string;
  apiBaseUrl?: string;
  checkSSL?: boolean;
}): GithubClient {
  return new GithubClient({
    logger: options.logger,
    config: {
      scmProvider: 'github',
      host: options.host,
      organization: WORKFLOW_DISPATCH_PLACEHOLDER_ORG,
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      checkSSL: options.checkSSL ?? true,
    },
  });
}

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
      } else if (!token) {
        this.logger.warn(
          `[ScmClientFactory] No token for GitHub host: ${resolvedHost}; ` +
            `REST endpoints (branches, tags, contents) will work for public repos, ` +
            `but GraphQL operations (organization repository listing) require authentication`,
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
    const integration = this.integrations.github.byHost(host);
    const apiBaseUrl = integration?.config.apiBaseUrl;

    if (!integration) {
      throw new Error(
        `No GitHub integration configured for host: ${host}. ` +
          `Please configure it in app-config.yaml under integrations.github`,
      );
    }

    try {
      return await resolveGithubToken({
        integrations: this.integrations,
        credentialsProvider: this.githubCredentialsProvider,
        logger: this.logger,
        host,
        organization,
        repository,
      });
    } catch {
      if (hasProvidedToken) {
        this.logger.warn(
          `[ScmClientFactory] GitHub credential resolution failed for host: ${host}, but using provided token`,
        );
      } else {
        this.logger.info(
          `[ScmClientFactory] No GitHub credentials for host: ${host}; public repository access only`,
        );
      }
      return { token: '', apiBaseUrl };
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
    const token = integration?.config.token;
    const apiBaseUrl = integration?.config.apiBaseUrl;

    if (!integration) {
      throw new Error(
        `No GitLab integration configured for host: ${host}. ` +
          `Please configure it in app-config.yaml under integrations.gitlab`,
      );
    } else if (token || hasProvidedToken) {
      this.logger.debug(
        `[ScmClientFactory] Using GitLab integration for host: ${host}`,
      );
    } else {
      this.logger.info(
        `[ScmClientFactory] No token configured for GitLab host: ${host}; public repository access only`,
      );
    }

    return { token: token || '', apiBaseUrl };
  }
}
