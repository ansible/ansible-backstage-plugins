import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type {
  BackstageCredentials,
  LoggerService,
  HttpAuthService,
  UserInfoService,
  AuthService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import type { CatalogClient } from '@backstage/catalog-client';
import type { Entity } from '@backstage/catalog-model';
import { ANNOTATION_EDIT_URL } from '@backstage/catalog-model';
import type { Config } from '@backstage/config';
import type { JsonValue } from '@backstage/types';
import type {
  BasicPermission,
  Permission,
  ResourcePermission,
} from '@backstage/plugin-permission-common';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type {
  DefaultGithubCredentialsProvider,
  ScmIntegrationRegistry,
} from '@backstage/integration';
import { ResponseError } from '@backstage/errors';
import {
  GitlabClient,
  resolveGithubToken,
  createGithubClientForWorkflowDispatch,
} from '@ansible/backstage-rhaap-common';

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

/** Parsed GitHub repository from a source/edit URL pointing at a blob or tree. */
export interface ParsedGitHubRepoFromSource {
  host: string;
  owner: string;
  repo: string;
  /** Branch or tag from the URL path (used as default workflow_dispatch ref). */
  defaultRef: string;
  /** Remaining path segments after ref (e.g. "ee1/execution-environment.yml"). */
  filePath?: string;
}

const KNOWN_FILE_EXT_RE = /\.(ya?ml|json|md|txt|cfg|ini|toml)$/i;

/**
 * Parses `https://{host}/{owner}/{repo}/blob/{ref}/...` or `/tree/{ref}/...`.
 * Also accepts `https://{host}/{owner}/{repo}` with default ref `main`.
 */
export function parseGitHubRepoFromSourceUrl(
  raw: string | undefined,
): ParsedGitHubRepoFromSource | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const url = raw.replace(/^url:/i, '').trim();
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return null;
    }
    const host = u.hostname;
    const parts = u.pathname.split('/').filter(Boolean);
    if (
      parts.length >= 4 &&
      (parts[2] === 'blob' || parts[2] === 'tree' || parts[2] === 'edit')
    ) {
      const afterAction = parts.slice(3);
      const { ref, filePath } = splitRefAndPath(afterAction);
      return {
        host,
        owner: parts[0],
        repo: parts[1],
        defaultRef: ref,
        ...(filePath ? { filePath } : {}),
      };
    }
    if (parts.length === 2) {
      return {
        host,
        owner: parts[0],
        repo: parts[1],
        defaultRef: 'main',
      };
    }
    return null;
  } catch {
    return null;
  }
}

function looksLikeRefSegment(seg: string): boolean {
  if (seg.includes('.')) return true;
  if (/^v\d/i.test(seg)) return true;
  if (/^\d+$/.test(seg)) return true;
  return false;
}

/**
 * Splits URL segments after the action keyword into ref and file path.
 * Uses a file-extension heuristic to handle multi-segment refs.
 */
function splitRefAndPath(segments: string[]): {
  ref: string;
  filePath: string | undefined;
} {
  if (segments.length === 0) {
    return { ref: 'main', filePath: undefined };
  }
  if (segments.length === 1) {
    return { ref: segments[0], filePath: undefined };
  }

  let fileIdx = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (KNOWN_FILE_EXT_RE.test(segments[i])) {
      fileIdx = i;
      break;
    }
  }

  if (fileIdx < 0) {
    return { ref: segments.join('/'), filePath: undefined };
  }

  let pathStart = fileIdx;
  while (pathStart > 1 && !looksLikeRefSegment(segments[pathStart - 1])) {
    pathStart--;
  }
  pathStart = Math.max(pathStart, 1);

  const ref = segments.slice(0, pathStart).join('/');
  const filePath = segments.slice(pathStart).join('/');
  return { ref, filePath: filePath || undefined };
}

export interface EeBuildRequestValidated {
  entityRef: string;
  /** Optional override; when omitted, owner is derived from entity annotations. */
  owner?: string;
  /** Optional override; when omitted, repo is derived from entity annotations. */
  repo?: string;
  /** Optional override; when omitted, host is derived from entity annotations. */
  host?: string;
  customRegistryUrl: string;
  imageName: string;
  imageTag: string;
  verifyTls: boolean;
  registryType?: string;
}

function assertNoControlChars(value: string, field: string): void {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`${field} contains invalid characters`);
  }
}

/** Rejects path traversal and absolute paths for a repo-relative directory. */
export function assertSafeRepoRelativeEeDir(eeDir: string): void {
  const normalized = eeDir.trim().replaceAll('\\', '/');
  if (normalized.startsWith('/')) {
    throw new Error('ee_dir must be relative to the repository root');
  }
  for (const segment of normalized.split('/')) {
    if (segment === '..') {
      throw new Error('ee_dir must not contain path traversal (..)');
    }
  }
}

/** File name only for EE definition (no directory components). */
export function assertSafeEeFileName(fileName: string): void {
  const t = fileName.trim();
  if (t.includes('/') || t.includes('\\')) {
    throw new Error('ee_file_name must be a file name without path separators');
  }
  if (t === '.' || t === '..') {
    throw new Error('ee_file_name is invalid');
  }
}

function requireString(val: unknown, field: string): string {
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error(`${field} is required`);
  }
  return val.trim();
}

function validateStringLength(
  val: string,
  field: string,
  maxLen: number,
): void {
  if (val.length > maxLen) {
    throw new Error(`${field} is too long`);
  }
  assertNoControlChars(val, field);
}

function parseOptionalRegistryType(val: unknown): string | undefined {
  if (val === undefined) {
    return undefined;
  }
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error('registryType must be a non-empty string when provided');
  }
  const trimmed = val.trim();
  assertNoControlChars(trimmed, 'registryType');
  return trimmed;
}

function trimIfString(val: unknown): string | undefined {
  return typeof val === 'string' ? val.trim() || undefined : undefined;
}

/**
 * Validates POST /ansible/ee/build JSON body.
 * @throws Error with a message suitable for HTTP 400 responses.
 */
export function parseEeBuildRequestBody(
  body: unknown,
): EeBuildRequestValidated {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a JSON object');
  }
  const o = body as Record<string, unknown>;

  const entityRefStr = trimIfString(o.entityRef);
  if (!entityRefStr) {
    throw new Error(
      'entityRef is required – ee_dir and ee_file_name are derived from entity annotations',
    );
  }
  validateStringLength(entityRefStr, 'entityRef', 512);

  const ownerStr = trimIfString(o.owner);
  const repoStr = trimIfString(o.repo);
  const hostStr = trimIfString(o.host);

  for (const [val, name, max] of [
    [ownerStr, 'owner', 256],
    [repoStr, 'repo', 256],
    [hostStr, 'host', 256],
  ] as const) {
    if (val) {
      validateStringLength(val, name, max);
    }
  }

  const registryStr = requireString(o.customRegistryUrl, 'customRegistryUrl');
  const imageStr = requireString(o.imageName, 'imageName');
  const imageTagStr = requireString(o.imageTag, 'imageTag');

  if (typeof o.verifyTls !== 'boolean') {
    throw new TypeError('verifyTls is required and must be a boolean');
  }

  validateStringLength(registryStr, 'customRegistryUrl', 1024);
  validateStringLength(imageStr, 'imageName', 1024);
  validateStringLength(imageTagStr, 'imageTag', 256);

  const registryTypeStr = parseOptionalRegistryType(o.registryType);

  return {
    entityRef: entityRefStr,
    ...(ownerStr ? { owner: ownerStr } : {}),
    ...(repoStr ? { repo: repoStr } : {}),
    ...(hostStr ? { host: hostStr } : {}),
    customRegistryUrl: registryStr,
    imageName: imageStr,
    imageTag: imageTagStr,
    verifyTls: o.verifyTls,
    ...(registryTypeStr ? { registryType: registryTypeStr } : {}),
  };
}

/** Resolved GitHub repository + ref for dispatching `ee-build.yml` via workflow_dispatch. */
export interface EeGithubDispatchContext {
  host: string;
  owner: string;
  repo: string;
  ref: string;
  /** Directory containing the EE definition, derived from the annotation file path. */
  eeDir?: string;
  /** EE definition file name, derived from the annotation file path. */
  eeFileName?: string;
}

function getAnnotationString(ann: Record<string, string>, key: string): string {
  const val = ann[key];
  return typeof val === 'string' ? val : '';
}

function deriveEeDirAndFile(
  filePath: string,
  entityName: string,
): { eeDir: string; eeFileName: string | undefined } {
  const lastSlash = filePath.lastIndexOf('/');
  let eeDir: string;
  let eeFileName: string | undefined;
  if (lastSlash >= 0) {
    eeDir = filePath.substring(0, lastSlash);
    eeFileName = filePath.substring(lastSlash + 1);
  } else {
    eeDir = '.';
    eeFileName = filePath;
  }
  if (eeFileName === 'catalog-info.yaml') {
    eeFileName = entityName ? `${entityName}.yml` : undefined;
  }
  assertSafeRepoRelativeEeDir(eeDir);
  if (eeFileName) {
    assertSafeEeFileName(eeFileName);
  }
  return { eeDir, eeFileName };
}

/**
 * Derives owner/repo/ref from a catalog EE Component's GitHub source or edit URL.
 * @throws Error with a message suitable for HTTP 400 when the entity cannot be used for a GitHub EE build.
 */
export function resolveGithubRepoForEeBuild(
  entity: Entity,
  gitRefOverride?: string,
): EeGithubDispatchContext {
  if (entity.kind !== 'Component') {
    throw new Error('Execution Environment build requires a Component entity');
  }
  if (entity.spec?.type !== 'execution-environment') {
    throw new Error('Entity spec.type must be execution-environment');
  }
  const ann = entity.metadata?.annotations ?? {};
  const candidates = [
    getAnnotationString(ann, ANNOTATION_EDIT_URL),
    getAnnotationString(ann, 'backstage.io/source-location'),
  ].filter(Boolean);

  if (candidates.length === 0) {
    throw new Error(
      'Execution Environment is missing a Git source annotation (backstage.io/source-location or edit URL)',
    );
  }

  const parsed = candidates
    .map(c => parseGitHubRepoFromSourceUrl(c.replace(/^url:/i, '').trim()))
    .find(Boolean);

  if (!parsed) {
    throw new Error(
      'Execution Environment source URL is not a GitHub repository URL; EE build workflow is GitHub-only',
    );
  }

  const ee = parsed.filePath
    ? deriveEeDirAndFile(parsed.filePath, entity.metadata?.name ?? '')
    : undefined;

  return {
    host: parsed.host,
    owner: parsed.owner,
    repo: parsed.repo,
    ref: (gitRefOverride ?? parsed.defaultRef).trim(),
    ...(ee?.eeDir ? { eeDir: ee.eeDir } : {}),
    ...(ee?.eeFileName ? { eeFileName: ee.eeFileName } : {}),
  };
}

/**
 * Validates a GitHub host is safe and allowed by the integrations config.
 * Returns an error message string if invalid, or `undefined` if the host is OK.
 */
export function validateGitHubHost(
  config: Config,
  host: string,
): string | undefined {
  if (!isSafeHostname(host)) {
    return 'Invalid GitHub host in entity URL';
  }
  if (!isGitHubHostAllowedForProxy(config, host)) {
    return `Host '${host}' is not allowed. Configure it under integrations.github.`;
  }
  return undefined;
}

/** Returns `true` when the error message looks like a client/validation issue from EE build. */
export function isKnownEeBuildError(msg: string): boolean {
  return (
    msg.includes('execution-environment') ||
    msg.includes('GitHub') ||
    msg.includes('source') ||
    msg.includes('Component')
  );
}

/** `res.locals` key where EE build middleware stores credentials for the route handler. */
export const EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY =
  'rhaapEeBuildCatalogCredentials' as const;

export interface ResolvedEeEntity {
  gh: { host: string; owner: string; repo: string; ref: string };
  eeDir: string | undefined;
  eeFileName: string | undefined;
}

export async function resolveEntityAndRepo(
  response: Response,
  auth: AuthService,
  catalogClient: CatalogClient,
  entityRef: string,
): Promise<ResolvedEeEntity | undefined> {
  const credentials = (
    response.locals as Record<string, BackstageCredentials | undefined>
  )[EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY];
  if (!credentials) {
    response.status(500).json({
      error: 'Internal error: missing auth context for EE build',
    });
    return undefined;
  }

  try {
    const { token: catalogToken } = await auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });

    const entity = await catalogClient.getEntityByRef(entityRef, {
      token: catalogToken,
    });
    if (!entity) {
      response.status(404).json({
        error: 'Entity not found or not visible with your credentials',
      });
      return undefined;
    }

    const resolved = resolveGithubRepoForEeBuild(entity);
    return {
      gh: resolved,
      eeDir: resolved.eeDir,
      eeFileName: resolved.eeFileName,
    };
  } catch (error) {
    if (error instanceof ResponseError && error.response.status === 403) {
      response.status(403).json({
        error: 'Not allowed to read this entity with your credentials',
      });
      return undefined;
    }
    const msg = error instanceof Error ? error.message : String(error);
    response.status(400).json({ error: msg });
    return undefined;
  }
}

export interface DispatchEeBuildOptions {
  response: Response;
  logger: LoggerService;
  config: Config;
  gh: { host: string; owner: string; repo: string; ref: string };
  eeDir: string;
  eeFileName: string;
  githubToken: string;
  parsedBody: {
    customRegistryUrl: string;
    imageName: string;
    imageTag: string;
    verifyTls: boolean;
  };
}

export async function dispatchEeBuild(
  opts: DispatchEeBuildOptions,
): Promise<void> {
  const {
    response,
    logger,
    config,
    gh,
    eeDir,
    eeFileName,
    githubToken,
    parsedBody,
  } = opts;
  const { apiBaseUrl } = getGitHubIntegrationForHost(config, gh.host);
  const githubClient = createGithubClientForWorkflowDispatch({
    logger,
    host: gh.host,
    token: githubToken,
    apiBaseUrl,
  });

  const ghResp = await githubClient.dispatchActionsWorkflow(
    gh.owner,
    gh.repo,
    'ee-build.yml',
    gh.ref,
    {
      ee_dir: eeDir,
      ee_file_name: eeFileName,
      ee_registry: parsedBody.customRegistryUrl,
      ee_image_name: parsedBody.imageName,
      image_build_tag: parsedBody.imageTag,
      registry_tls_verify: String(parsedBody.verifyTls),
    },
  );

  if (!ghResp.ok) {
    logger.warn('[ansible/ee/build] GitHub workflow_dispatch failed', {
      status: ghResp.status,
      owner: gh.owner,
      repo: gh.repo,
      body: ghResp.bodyText,
    });
    const clientErr = ghResp.status >= 400 && ghResp.status < 500;
    response.status(clientErr ? ghResp.status : 502).json({
      error: `GitHub workflow_dispatch failed: ${ghResp.bodyText || ghResp.statusText}`,
    });
    return;
  }

  logger.info(
    `[ansible/ee/build] Dispatched ee-build.yml for ${gh.owner}/${gh.repo}@${gh.ref}`,
  );

  response.status(202).json({
    message: 'Build started',
    ...(ghResp.workflowRunId && {
      workflow_id: ghResp.workflowRunId,
    }),
    ...(ghResp.workflowRunUrl && {
      workflow_url: ghResp.workflowRunUrl,
    }),
  });
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

/** Same allowlist semantics as sync superuser routes: optional subject filter for service principals. */
export interface RequireUserOrExternalAccessDeps {
  httpAuth: HttpAuthService;
  auth: AuthService;
  logger: LoggerService;
  allowedExternalAccessSubjects?: string[];
}

/**
 * Authenticates the request as a Backstage user or an allowed external-access (service) principal.
 * @returns Credentials when the caller may proceed; otherwise sends 401/403 and returns null.
 */
export function checkRequireUserOrExternalAccess(
  deps: RequireUserOrExternalAccessDeps,
): (req: Request, res: Response) => Promise<BackstageCredentials | null> {
  const { httpAuth, auth, logger, allowedExternalAccessSubjects } = deps;
  return async (
    req: Request,
    res: Response,
  ): Promise<BackstageCredentials | null> => {
    try {
      const credentials = await httpAuth.credentials(req as any, {
        allow: ['user', 'service'],
      });
      if (auth.isPrincipal(credentials, 'service')) {
        const subject = credentials.principal.subject;
        const allowed =
          !allowedExternalAccessSubjects?.length ||
          allowedExternalAccessSubjects.includes(subject);
        if (allowed) {
          logger.info(
            `[EE build] Allowing request: external access (service principal, subject=${subject})`,
          );
          return credentials;
        }
        logger.warn(
          `[EE build] Rejecting request: service principal subject '${subject}' not in allowedExternalAccessSubjects`,
        );
        res.status(403).json({
          error:
            'Forbidden: external access subject not allowed for this endpoint',
        });
        return null;
      }
      return credentials;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.debug(`[EE build] Authentication failed: ${errorMessage}`);
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
  };
}

/**
 * Middleware for POST /ansible/ee/build: user session or allowlisted external access token.
 * Stores {@link BackstageCredentials} on `res.locals[EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY]`.
 */
export function createRequireUserOrExternalAccessMiddleware(
  deps: RequireUserOrExternalAccessDeps,
): RequestHandler {
  const authenticate = checkRequireUserOrExternalAccess(deps);
  return async (req: Request, res: Response, next: (err?: unknown) => void) => {
    const credentials = await authenticate(req, res);
    if (credentials) {
      (res.locals as Record<string, BackstageCredentials>)[
        EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY
      ] = credentials;
      next();
    }
  };
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

export interface CIActivityDeps {
  config: Config;
  logger: LoggerService;
  scmIntegrations: ScmIntegrationRegistry;
  githubCredentialsProvider: DefaultGithubCredentialsProvider;
}

export async function handleGitHubCIActivity(
  deps: CIActivityDeps,
  request: Request,
  response: Response,
  perPage: number,
): Promise<void> {
  const { config, logger, scmIntegrations, githubCredentialsProvider } = deps;
  const owner = request.query.owner as string | undefined;
  const repo = request.query.repo as string | undefined;
  const host = (request.query.host as string) || 'github.com';

  if (!owner || !repo) {
    response.status(400).json({
      error: 'Missing required query parameters for GitHub: owner, repo',
    });
    return;
  }

  if (!isSafeHostname(host)) {
    response.status(400).json({
      error: 'Invalid host: must be a valid hostname (e.g. github.com)',
    });
    return;
  }

  if (!isGitHubHostAllowedForProxy(config, host)) {
    response.status(400).json({
      error: `Host '${host}' is not allowed for GitHub CI activity. Add it under integrations.github in app-config, or use github.com.`,
    });
    return;
  }

  // Resolve token: GitHub App installation token → integration PAT → request header.
  let token: string | undefined;
  let apiBase: string | undefined;
  try {
    const resolved = await resolveGithubToken({
      integrations: scmIntegrations,
      credentialsProvider: githubCredentialsProvider,
      logger,
      host,
      organization: owner,
      repository: repo,
    });
    token = resolved.token;
    apiBase = resolved.apiBaseUrl;
  } catch {
    const tokenFromRequest = request.headers.authorization?.replace(
      /^Bearer\s+/i,
      '',
    );
    token = tokenFromRequest;
  }

  if (!token) {
    response.status(400).json({
      error:
        'Missing authorization (Authorization header or integrations.github token in config)',
    });
    return;
  }

  if (!apiBase) {
    apiBase =
      host === 'github.com'
        ? 'https://api.github.com'
        : `https://${host}/api/v3`;
  }
  const apiUrl = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=${perPage}`;

  try {
    const fetchResponse = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const data = await fetchResponse.json();

    if (!fetchResponse.ok) {
      logger.warn('[CI Activity proxy] GitHub API returned non-OK', {
        status: fetchResponse.status,
        owner,
        repo,
        host,
        body: data as JsonValue,
      });
    }

    response.status(fetchResponse.status).json(data as JsonValue);
  } catch (err) {
    logger.warn(
      'CI Activity proxy (GitHub) failed',
      err instanceof Error ? err : undefined,
    );
    response
      .status(502)
      .json({ error: 'Failed to fetch GitHub workflow runs' });
  }
}

export async function handleGitLabCIActivity(
  deps: CIActivityDeps,
  request: Request,
  response: Response,
  perPage: number,
): Promise<void> {
  const { config, logger } = deps;
  const projectPath = request.query.projectPath as string | undefined;
  const host = (request.query.host as string) || 'gitlab.com';

  if (!projectPath) {
    response.status(400).json({
      error: 'Missing required query parameter: projectPath',
    });
    return;
  }

  if (!isSafeHostname(host)) {
    response.status(400).json({
      error: 'Invalid host: must be a valid hostname (e.g. gitlab.com)',
    });
    return;
  }

  if (!isGitLabHostAllowedForProxy(config, host)) {
    response.status(400).json({
      error: `Host '${host}' is not allowed for GitLab CI activity. Add it under integrations.gitlab in app-config, or use gitlab.com.`,
    });
    return;
  }

  const tokenFromRequest =
    (request.headers['private-token'] as string) ||
    request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const { token: tokenFromConfig, apiBaseUrl: apiBaseFromConfig } =
    getGitLabIntegrationForHost(config, host);
  const token = tokenFromConfig || tokenFromRequest;

  if (!token) {
    response.status(400).json({
      error:
        'Missing projectPath or authorization (PRIVATE-TOKEN, Authorization header, or integrations.gitlab token in config)',
    });
    return;
  }

  const hostLower = host.toLowerCase();
  const skipTlsVerify = getSkipTlsVerifyHosts(config)
    .filter(isSafeHostname)
    .some(h => h.toLowerCase() === hostLower);

  const client = new GitlabClient({
    config: {
      scmProvider: 'gitlab',
      host,
      organization: '',
      token,
      apiBaseUrl: apiBaseFromConfig,
      checkSSL: !skipTlsVerify,
    },
    logger,
  });

  try {
    const { ok, status, data } = await client.getPipelines(projectPath, {
      perPage,
    });

    if (!ok) {
      logger.warn('[CI Activity proxy] GitLab API returned non-OK', {
        status,
        projectPath,
        host,
        body: data as JsonValue,
      });
    }

    response.status(status).json(data as JsonValue);
  } catch (err) {
    logger.warn(
      'CI Activity proxy (GitLab) failed',
      err instanceof Error ? err : undefined,
    );
    response.status(502).json({ error: 'Failed to fetch GitLab pipelines' });
  }
}

/* ------------------------------------------------------------------ */
/*  Permission-check middleware factory                                */
/* ------------------------------------------------------------------ */

export interface PermissionMiddlewareDeps {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
}

/**
 * Creates an Express middleware that resolves credentials and evaluates a
 * mixed list of basic and resource permissions.
 *
 * Basic permissions (`type: 'basic'`) are checked via `authorize`; the result
 * is `true` when `AuthorizeResult.ALLOW`.
 *
 * Resource permissions (`type: 'resource'`) are checked via
 * `authorizeConditional`; the result is `true` when the decision is **not**
 * `AuthorizeResult.DENY` (i.e. ALLOW or CONDITIONAL).
 *
 * On success the following are attached to `response.locals`:
 *  - `credentials`  – the resolved {@link BackstageCredentials}
 *  - `permissions`  – a `Record<string, boolean>` keyed by permission name
 *
 * The middleware does **not** enforce any policy; it is the caller's
 * responsibility to inspect the map and return 403 when appropriate.
 *
 * @param deps - httpAuth and permissions services
 * @param permissionsToCheck - basic and/or resource permissions to evaluate
 */
export function createPermissionCheckMiddleware(
  deps: PermissionMiddlewareDeps,
  permissionsToCheck: Permission[],
): RequestHandler {
  const { httpAuth, permissions } = deps;

  const basicPerms = permissionsToCheck.filter(
    (p): p is BasicPermission => p.type === 'basic',
  );
  const resourcePerms = permissionsToCheck.filter(
    (p): p is ResourcePermission => p.type === 'resource',
  );

  return async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const credentials = await httpAuth.credentials(request as any);

      const [basicDecisions, conditionalDecisions] = await Promise.all([
        basicPerms.length
          ? permissions.authorize(
              basicPerms.map(permission => ({ permission })),
              { credentials },
            )
          : Promise.resolve([]),
        resourcePerms.length
          ? permissions.authorizeConditional(
              resourcePerms.map(permission => ({ permission })),
              { credentials },
            )
          : Promise.resolve([]),
      ]);

      const results: Record<string, boolean> = {};
      basicPerms.forEach((perm, i) => {
        results[perm.name] = basicDecisions[i].result === AuthorizeResult.ALLOW;
      });
      resourcePerms.forEach((perm, i) => {
        results[perm.name] =
          conditionalDecisions[i].result !== AuthorizeResult.DENY;
      });

      response.locals.credentials = credentials;
      response.locals.permissions = results;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Detects SCM upstream auth failures from error messages thrown by
 * Backstage integrations / Octokit / GitLab clients when the app-config token is bad.
 */
export function isScmIntegrationAuthFailure(message: string): boolean {
  const m = message.toLowerCase();

  // Upstream APIs typically surface invalid/expired integration tokens as 401.
  if (/\b401\b/.test(m)) {
    return true;
  }

  const hints = [
    'bad credentials',
    'bad token',
    'invalid token',
    'expired token',
    'token expired',
    'not authenticated',
    'could not authenticate',
    'failed to authenticate',
    'must be authenticated',
    'authentication failed',
    'incorrect authentication',
    'oauth token',
    'revoked',
    'requires authentication',
    'could not resolve github token',
    'could not resolve gitlab token',
    'unable to authenticate',
    'permission denied',
  ];

  return hints.some(h => m.includes(h));
}
