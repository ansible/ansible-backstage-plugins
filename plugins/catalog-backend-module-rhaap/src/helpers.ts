import type { Request, Response, RequestHandler } from 'express';
import type {
  LoggerService,
  HttpAuthService,
  UserInfoService,
  AuthService,
} from '@backstage/backend-plugin-api';
import type { CatalogClient } from '@backstage/catalog-client';
import type { Config } from '@backstage/config';

import { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';

export function getGitLabIntegrationForHost(
  config: Config,
  host: string,
): { token?: string; apiBaseUrl?: string } {
  const arr = config.getOptionalConfigArray('integrations.gitlab');
  if (!arr?.length) return {};
  for (const c of arr) {
    const h = c.getOptionalString('host') ?? 'gitlab.com';
    if (h !== host) continue;
    const token = c.getOptionalString('token');
    const apiBaseUrl = c.getOptionalString('apiBaseUrl')?.replace(/\/$/, '');
    return { token, apiBaseUrl };
  }
  return {};
}

export function getGitHubIntegrationForHost(
  config: Config,
  host: string,
): { token?: string; apiBaseUrl?: string } {
  const arr = config.getOptionalConfigArray('integrations.github');
  if (!arr?.length) return {};
  for (const c of arr) {
    const h = c.getOptionalString('host') ?? 'github.com';
    if (h !== host) continue;
    const token = c.getOptionalString('token');
    const apiBaseUrl = c.getOptionalString('apiBaseUrl')?.replace(/\/$/, '');
    return { token, apiBaseUrl };
  }
  return {};
}

export function isGitHubHostAllowedForProxy(
  config: Config,
  host: string,
): boolean {
  if (host === 'github.com') {
    return true;
  }
  const arr = config.getOptionalConfigArray('integrations.github');
  if (!arr?.length) {
    return false;
  }
  for (const c of arr) {
    const h = c.getOptionalString('host') ?? 'github.com';
    if (h === host) {
      return true;
    }
  }
  return false;
}

export function isGitLabHostAllowedForProxy(
  config: Config,
  host: string,
): boolean {
  if (host === 'gitlab.com') {
    return true;
  }
  const arr = config.getOptionalConfigArray('integrations.gitlab');
  if (!arr?.length) {
    return false;
  }
  for (const c of arr) {
    const h = c.getOptionalString('host') ?? 'gitlab.com';
    if (h === host) {
      return true;
    }
  }
  return false;
}

export function isSafeHostname(host: string): boolean {
  if (typeof host !== 'string' || host.length === 0 || host.length > 253) {
    return false;
  }
  return /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host);
}

export function getSkipTlsVerifyHosts(config: Config): string[] {
  return (
    config.getOptionalStringArray('catalog.ansible.skipTlsVerifyForHosts') ?? []
  );
}

export function formatNameSpace(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^\w\s]/gi, '')
    .replaceAll(/\s/g, '-');
}

export function buildFileUrl(
  scmProvider: 'github' | 'gitlab',
  host: string,
  repoPath: string,
  ref: string,
  filePath: string,
): string {
  if (scmProvider === 'github') {
    return `https://${host}/${repoPath}/blob/${ref}/${filePath}`;
  }
  // gitlab
  return `https://${host}/${repoPath}/-/blob/${ref}/${filePath}`;
}

export function getDirectoryFromPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
}

export interface SyncFilter {
  scmProvider?: 'github' | 'gitlab';
  hostName?: string;
  organization?: string;
}

export function validateSyncFilter(filter: SyncFilter): string | null {
  if (!filter.scmProvider && !filter.hostName && !filter.organization) {
    return null;
  }

  if (filter.hostName && !filter.scmProvider) {
    return 'hostName requires scmProvider to be specified';
  }

  if (filter.organization) {
    if (!filter.scmProvider) {
      return 'organization requires scmProvider to be specified';
    }
    if (!filter.hostName) {
      return 'organization requires hostName to be specified';
    }
  }

  return null;
}

export interface ParsedSourceInfo {
  env: string;
  scmProvider: string;
  hostName: string;
  organization: string;
}

export function parseSourceId(sourceId: string): ParsedSourceInfo {
  const parts = sourceId.split(':');

  if (parts.length !== 4) {
    console.warn(
      `[parseSourceId] Invalid sourceId format: ${sourceId}, expected 4 parts separated by ':'`,
    );
    return {
      env: parts[0] || 'unknown',
      scmProvider: parts[1] || 'unknown',
      hostName: parts[2] || 'unknown',
      organization: parts.slice(3).join(':') || 'unknown',
    };
  }

  return {
    env: parts[0],
    scmProvider: parts[1],
    hostName: parts[2],
    organization: parts[3],
  };
}

export function providerMatchesFilter(
  providerInfo: ParsedSourceInfo,
  filter: SyncFilter,
): boolean {
  if (filter.scmProvider && providerInfo.scmProvider !== filter.scmProvider) {
    return false;
  }
  if (filter.hostName && providerInfo.hostName !== filter.hostName) {
    return false;
  }
  if (
    filter.organization &&
    providerInfo.organization !== filter.organization
  ) {
    return false;
  }
  return true;
}

export function findMatchingProviders(
  providers: AnsibleGitContentsProvider[],
  filters: SyncFilter[],
): Set<string> {
  const matchedProviderIds = new Set<string>();

  for (const filter of filters) {
    for (const provider of providers) {
      const sourceId = provider.getSourceId();
      const providerInfo = parseSourceId(sourceId);

      if (providerMatchesFilter(providerInfo, filter)) {
        matchedProviderIds.add(sourceId);
      }
    }
  }

  return matchedProviderIds;
}

export interface SyncStatus {
  sync_started: number;
  already_syncing: number;
  failed: number;
  invalid: number;
}

export type SyncResultStatus =
  | 'sync_started'
  | 'already_syncing'
  | 'failed'
  | 'invalid';

export interface SCMSyncResult {
  scmProvider: string;
  hostName: string;
  organization: string;
  providerName?: string;
  status: SyncResultStatus;
  error?: { code: string; message: string };
}

/**
 * Resolves which providers to run from repository names.
 * If repositoryNames is empty, returns all providers; otherwise splits names
 * into valid (providers to run) and invalid (not in the map).
 */
export function resolveProvidersToRun<T>(
  repositoryNames: string[],
  providerMap: Map<string, T>,
  allProviders: T[],
): { providersToRun: T[]; invalidRepositories: string[] } {
  const invalidRepositories: string[] = [];
  if (repositoryNames.length === 0) {
    return { providersToRun: allProviders, invalidRepositories };
  }
  const providersToRun: T[] = [];
  for (const name of repositoryNames) {
    const provider = providerMap.get(name);
    if (provider === undefined) {
      invalidRepositories.push(name);
    } else {
      providersToRun.push(provider);
    }
  }
  return { providersToRun, invalidRepositories };
}

/** Result entry for a repository that was not found in configured providers */
export interface InvalidRepositoryResult {
  repositoryName: string;
  status: 'invalid';
  error: { code: string; message: string };
}

/**
 * Builds sync result entries for invalid (unknown) repository names.
 */
export function buildInvalidRepositoryResults(
  invalidRepositories: string[],
): InvalidRepositoryResult[] {
  return invalidRepositories.map(repositoryName => ({
    repositoryName,
    status: 'invalid' as const,
    error: {
      code: 'INVALID_REPOSITORY',
      message: `Repository '${repositoryName}' not found in configured providers`,
    },
  }));
}

/**
 * Computes the HTTP status code for the PAH collection sync response based on
 * result flags and whether the request was empty.
 */
export function getSyncResponseStatusCode(params: {
  results: { status: string }[];
  emptyRequest: boolean;
}): number {
  const { results, emptyRequest } = params;
  const hasFailures = results.some(r => r.status === 'failed');
  const hasStarted = results.some(r => r.status === 'sync_started');
  const hasInvalid = results.some(r => r.status === 'invalid');
  const allStarted =
    results.length > 0 && results.every(r => r.status === 'sync_started');
  const allSkipped =
    results.length > 0 && results.every(r => r.status === 'already_syncing');
  const allFailed =
    results.length > 0 && results.every(r => r.status === 'failed');
  const allInvalid =
    results.length > 0 && results.every(r => r.status === 'invalid');

  if (
    allInvalid ||
    emptyRequest ||
    (hasInvalid && hasFailures && !hasStarted)
  ) {
    return 400;
  }
  if (allFailed) return 500;
  if (allStarted) return 202;
  if (allSkipped) return 200;
  return 207; // Mixed results (e.g., some started + some skipped/failed/invalid)
}

export interface RequireSuperuserDeps {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  auth: AuthService;
  catalogClient: CatalogClient;
  logger: LoggerService;
  /**
   * When set, only service principals with this subject are allowed as external access.
   * Typically populated from backend.auth.externalAccess[].options.subject in app-config.
   * If empty/undefined, any service principal is allowed.
   */
  allowedExternalAccessSubjects?: string[];
}

/**
 * Returns a function that checks the request has a catalog user with
 * `aap.platform/is_superuser` annotation. If not, sends 403 and returns false.
 */
export function checkRequireSuperuser(
  deps: RequireSuperuserDeps,
): (req: Request, res: Response) => Promise<boolean> {
  const {
    httpAuth,
    userInfo,
    auth,
    catalogClient,
    logger,
    allowedExternalAccessSubjects,
  } = deps;
  return async (req: Request, res: Response): Promise<boolean> => {
    try {
      const credentials = await httpAuth.credentials(req as any, {
        allow: ['service', 'user'],
      });
      // Service principal = external access token (from backend.auth.externalAccess in app-config).
      if (auth.isPrincipal(credentials, 'service')) {
        const subject = credentials.principal.subject;
        const allowed =
          !allowedExternalAccessSubjects?.length ||
          allowedExternalAccessSubjects.includes(subject);
        if (allowed) {
          logger.info(
            `Allowing sync request: external access (service principal, subject=${subject})`,
          );
          return true;
        }
        logger.warn(
          `Rejecting sync request: service principal subject '${subject}' not in allowedExternalAccessSubjects`,
        );
        res.status(403).json({
          error:
            'Forbidden: external access subject not allowed for this endpoint',
        });
        return false;
      }
      // User principal: require superuser in catalog.
      const { userEntityRef } = await userInfo.getUserInfo(credentials);
      const { token } = await auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: 'catalog',
      });
      const userEntity = await catalogClient.getEntityByRef(userEntityRef, {
        token,
      });
      const isSuperuser =
        userEntity?.metadata?.annotations?.['aap.platform/is_superuser'] ===
        'true';
      if (!isSuperuser) {
        res.status(403).json({ error: 'Forbidden: superuser access required' });
        return false;
      }
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Superuser check failed: ${errorMessage}`);
      res.status(500).json({
        error: `Authorization failed: ${errorMessage}`,
      });
      return false;
    }
  };
}

/**
 * Returns an Express middleware that requires superuser. Use as a route
 * decorator: router.get('/path', requireSuperuserMiddleware, handler).
 * On success calls next(); on failure sends 403/500 and does not call next().
 */
export function createRequireSuperuserMiddleware(
  deps: RequireSuperuserDeps,
): RequestHandler {
  const requireSuperuser = checkRequireSuperuser(deps);
  return async (req: Request, res: Response, next: (err?: unknown) => void) => {
    const allowed = await requireSuperuser(req, res);
    if (allowed) next();
  };
}
