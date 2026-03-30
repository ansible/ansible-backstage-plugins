import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  DefaultGithubCredentialsProvider,
  ScmIntegrationRegistry,
} from '@backstage/integration';

export interface ResolveGithubTokenOptions {
  integrations: ScmIntegrationRegistry;
  credentialsProvider: DefaultGithubCredentialsProvider;
  logger: LoggerService;
  host: string;
  organization: string;
  repository?: string;
}

/**
 * Resolves a GitHub token for the given host/org/repo.
 *
 * Resolution order:
 *  1. GitHub App installation token via {@link DefaultGithubCredentialsProvider}
 *  2. Integration PAT from `integrations.github[].token`
 *
 * Throws when no integration is configured for the host or no token can be
 * resolved from either path.
 */
export async function resolveGithubToken(
  options: ResolveGithubTokenOptions,
): Promise<{ token: string; apiBaseUrl?: string }> {
  const {
    integrations,
    credentialsProvider,
    logger,
    host,
    organization,
    repository,
  } = options;

  const integration = integrations.github.byHost(host);
  if (!integration) {
    throw new Error(
      `No GitHub integration configured for host: ${host}. ` +
        `Please configure it in app-config.yaml under integrations.github`,
    );
  }

  const config = integration.config;
  const h = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = repository
    ? `https://${h}/${organization}/${repository}`
    : `https://${h}/${organization}`;

  let token: string | undefined;

  try {
    const credentials = await credentialsProvider.getCredentials({ url });
    token = credentials.token;
  } catch (err) {
    logger.debug(
      `[resolveGithubToken] GitHub App credentials unavailable for ${url}, falling back to integration token: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!token) {
    token = config.token;
  }

  if (!token) {
    throw new Error(
      `No credentials for GitHub host: ${host} (org: ${organization}${
        repository ? `, repo: ${repository}` : ''
      }). Configure a GitHub App (recommended) or a PAT under integrations.github in app-config.yaml, and ensure the app is installed for the organization when using an App.`,
    );
  }

  logger.debug(
    `[resolveGithubToken] Resolved GitHub credentials for host: ${host}`,
  );
  return { token, apiBaseUrl: config.apiBaseUrl };
}
