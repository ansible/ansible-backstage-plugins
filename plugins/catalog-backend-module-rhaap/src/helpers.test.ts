const mockGetPipelines = jest.fn();
const mockDispatchActionsWorkflow = jest.fn();

jest.mock('@ansible/backstage-rhaap-common', () => {
  const actual = jest.requireActual('@ansible/backstage-rhaap-common');
  return {
    ...actual,
    GitlabClient: jest.fn().mockImplementation(() => ({
      getPipelines: mockGetPipelines,
    })),
    createGithubClientForWorkflowDispatch: jest.fn(() => ({
      dispatchActionsWorkflow: mockDispatchActionsWorkflow,
    })),
  };
});

import { ANNOTATION_EDIT_URL } from '@backstage/catalog-model';
import { ConfigReader } from '@backstage/config';
import {
  formatNameSpace,
  buildFileUrl,
  getDirectoryFromPath,
  validateSyncFilter,
  parseSourceId,
  providerMatchesFilter,
  findMatchingProviders,
  ParsedSourceInfo,
  resolveProvidersToRun,
  buildInvalidRepositoryResults,
  getSyncResponseStatusCode,
  checkRequireSuperuser,
  checkRequireUserOrExternalAccess,
  createRequireSuperuserMiddleware,
  createRequireUserOrExternalAccessMiddleware,
  EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY,
  RequireSuperuserDeps,
  CIActivityDeps,
  RequireUserOrExternalAccessDeps,
  isSafeHostname,
  getGitHubIntegrationForHost,
  getGitLabIntegrationForHost,
  getSkipTlsVerifyHosts,
  isGitHubHostAllowedForProxy,
  isGitLabHostAllowedForProxy,
  handleGitHubCIActivity,
  handleGitLabCIActivity,
  resolveGithubRepoForEeBuild,
  parseEeBuildRequestBody,
  parseGitHubRepoFromSourceUrl,
  assertSafeRepoRelativeEeDir,
  assertSafeEeFileName,
  createPermissionCheckMiddleware,
  validateGitHubHost,
  isKnownEeBuildError,
  resolveEntityAndRepo,
  dispatchEeBuild,
  isScmIntegrationAuthFailure,
} from './helpers';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { AnsibleGitContentsProvider } from './providers/AnsibleGitContentsProvider';

describe('helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('formatNameSpace', () => {
    it('should format name space with special characters', () => {
      const result = formatNameSpace('test default ++test 123');
      expect(result).toEqual('test-default-test-123');
    });

    it('should convert to lowercase', () => {
      expect(formatNameSpace('Test Namespace')).toEqual('test-namespace');
    });

    it('should remove special characters', () => {
      expect(formatNameSpace('test@namespace#special!')).toEqual(
        'testnamespacespecial',
      );
    });

    it('should replace spaces with hyphens', () => {
      expect(formatNameSpace('test namespace')).toEqual('test-namespace');
    });

    it('should handle empty string', () => {
      expect(formatNameSpace('')).toEqual('');
    });

    it('should handle multiple spaces', () => {
      expect(formatNameSpace('test   multiple   spaces')).toEqual(
        'test---multiple---spaces',
      );
    });
  });

  describe('buildFileUrl', () => {
    it('should build correct GitHub URL', () => {
      const url = buildFileUrl(
        'github',
        'github.com',
        'org/repo',
        'main',
        'path/to/file.yml',
      );
      expect(url).toBe(
        'https://github.com/org/repo/blob/main/path/to/file.yml',
      );
    });

    it('should build correct GitLab URL', () => {
      const url = buildFileUrl(
        'gitlab',
        'gitlab.com',
        'group/project',
        'main',
        'path/to/file.yml',
      );
      expect(url).toBe(
        'https://gitlab.com/group/project/-/blob/main/path/to/file.yml',
      );
    });

    it('should handle custom hosts', () => {
      const url = buildFileUrl(
        'github',
        'github.enterprise.com',
        'org/repo',
        'develop',
        'galaxy.yml',
      );
      expect(url).toBe(
        'https://github.enterprise.com/org/repo/blob/develop/galaxy.yml',
      );
    });

    it('should handle tags as refs', () => {
      const url = buildFileUrl(
        'github',
        'github.com',
        'org/repo',
        'v1.0.0',
        'galaxy.yml',
      );
      expect(url).toBe('https://github.com/org/repo/blob/v1.0.0/galaxy.yml');
    });
  });

  describe('getDirectoryFromPath', () => {
    it('should return directory from path', () => {
      expect(getDirectoryFromPath('path/to/file.yml')).toBe('path/to');
    });

    it('should return empty string for file at root', () => {
      expect(getDirectoryFromPath('file.yml')).toBe('');
    });

    it('should handle nested paths', () => {
      expect(getDirectoryFromPath('a/b/c/d/file.yml')).toBe('a/b/c/d');
    });

    it('should handle path with single directory', () => {
      expect(getDirectoryFromPath('dir/file.yml')).toBe('dir');
    });
  });

  describe('validateSyncFilter', () => {
    it('should return null for empty filter', () => {
      expect(validateSyncFilter({})).toBeNull();
    });

    it('should return null for valid scmProvider only', () => {
      expect(validateSyncFilter({ scmProvider: 'github' })).toBeNull();
    });

    it('should return null for valid scmProvider and hostName', () => {
      expect(
        validateSyncFilter({ scmProvider: 'github', hostName: 'github.com' }),
      ).toBeNull();
    });

    it('should return null for valid full filter', () => {
      expect(
        validateSyncFilter({
          scmProvider: 'github',
          hostName: 'github.com',
          organization: 'test-org',
        }),
      ).toBeNull();
    });

    it('should return error when hostName without scmProvider', () => {
      expect(validateSyncFilter({ hostName: 'github.com' })).toBe(
        'hostName requires scmProvider to be specified',
      );
    });

    it('should return error when organization without scmProvider', () => {
      expect(validateSyncFilter({ organization: 'test-org' })).toBe(
        'organization requires scmProvider to be specified',
      );
    });

    it('should return error when organization without hostName', () => {
      expect(
        validateSyncFilter({ scmProvider: 'github', organization: 'test-org' }),
      ).toBe('organization requires hostName to be specified');
    });
  });

  describe('parseSourceId', () => {
    it('should parse valid sourceId with 4 parts', () => {
      const result = parseSourceId('dev:github:github.com:test-org');
      expect(result).toEqual({
        env: 'dev',
        scmProvider: 'github',
        hostName: 'github.com',
        organization: 'test-org',
      });
    });

    it('should handle sourceId with fewer than 4 parts', () => {
      const result = parseSourceId('dev:github');
      expect(result).toEqual({
        env: 'dev',
        scmProvider: 'github',
        hostName: 'unknown',
        organization: 'unknown',
      });
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid sourceId format'),
      );
    });

    it('should handle sourceId with more than 4 parts (colons in org)', () => {
      const result = parseSourceId('dev:github:github.com:org:with:colons');
      expect(result).toEqual({
        env: 'dev',
        scmProvider: 'github',
        hostName: 'github.com',
        organization: 'org:with:colons',
      });
      expect(console.warn).toHaveBeenCalled();
    });

    it('should handle empty sourceId', () => {
      const result = parseSourceId('');
      expect(result.env).toBe('unknown');
      expect(console.warn).toHaveBeenCalled();
    });

    it('should handle single part sourceId', () => {
      const result = parseSourceId('dev');
      expect(result).toEqual({
        env: 'dev',
        scmProvider: 'unknown',
        hostName: 'unknown',
        organization: 'unknown',
      });
    });
  });

  describe('providerMatchesFilter', () => {
    const providerInfo: ParsedSourceInfo = {
      env: 'dev',
      scmProvider: 'github',
      hostName: 'github.com',
      organization: 'test-org',
    };

    it('should match when no filter specified', () => {
      expect(providerMatchesFilter(providerInfo, {})).toBe(true);
    });

    it('should match when scmProvider matches', () => {
      expect(
        providerMatchesFilter(providerInfo, { scmProvider: 'github' }),
      ).toBe(true);
    });

    it('should not match when scmProvider differs', () => {
      expect(
        providerMatchesFilter(providerInfo, { scmProvider: 'gitlab' }),
      ).toBe(false);
    });

    it('should match when hostName matches', () => {
      expect(
        providerMatchesFilter(providerInfo, {
          scmProvider: 'github',
          hostName: 'github.com',
        }),
      ).toBe(true);
    });

    it('should not match when hostName differs', () => {
      expect(
        providerMatchesFilter(providerInfo, {
          scmProvider: 'github',
          hostName: 'github.enterprise.com',
        }),
      ).toBe(false);
    });

    it('should match when organization matches', () => {
      expect(
        providerMatchesFilter(providerInfo, {
          scmProvider: 'github',
          hostName: 'github.com',
          organization: 'test-org',
        }),
      ).toBe(true);
    });

    it('should not match when organization differs', () => {
      expect(
        providerMatchesFilter(providerInfo, {
          scmProvider: 'github',
          hostName: 'github.com',
          organization: 'other-org',
        }),
      ).toBe(false);
    });
  });

  describe('findMatchingProviders', () => {
    const createMockProvider = (
      sourceId: string,
    ): AnsibleGitContentsProvider => {
      return {
        getSourceId: () => sourceId,
      } as unknown as AnsibleGitContentsProvider;
    };

    it('should find providers matching single filter', () => {
      const providers = [
        createMockProvider('dev:github:github.com:org1'),
        createMockProvider('dev:gitlab:gitlab.com:org2'),
      ];

      const result = findMatchingProviders(providers, [
        { scmProvider: 'github' },
      ]);

      expect(result.size).toBe(1);
      expect(result.has('dev:github:github.com:org1')).toBe(true);
    });

    it('should find providers matching multiple filters', () => {
      const providers = [
        createMockProvider('dev:github:github.com:org1'),
        createMockProvider('dev:gitlab:gitlab.com:org2'),
        createMockProvider('dev:github:github.enterprise.com:org3'),
      ];

      const result = findMatchingProviders(providers, [
        { scmProvider: 'github', hostName: 'github.com' },
        { scmProvider: 'gitlab' },
      ]);

      expect(result.size).toBe(2);
      expect(result.has('dev:github:github.com:org1')).toBe(true);
      expect(result.has('dev:gitlab:gitlab.com:org2')).toBe(true);
    });

    it('should return empty set when no providers match', () => {
      const providers = [createMockProvider('dev:github:github.com:org1')];

      const result = findMatchingProviders(providers, [
        { scmProvider: 'bitbucket' as any },
      ]);

      expect(result.size).toBe(0);
    });

    it('should handle empty providers list', () => {
      const result = findMatchingProviders([], [{ scmProvider: 'github' }]);
      expect(result.size).toBe(0);
    });

    it('should handle empty filters list', () => {
      const providers = [createMockProvider('dev:github:github.com:org1')];

      const result = findMatchingProviders(providers, []);
      expect(result.size).toBe(0);
    });

    it('should deduplicate when multiple filters match same provider', () => {
      const providers = [createMockProvider('dev:github:github.com:org1')];

      const result = findMatchingProviders(providers, [
        { scmProvider: 'github' },
        { scmProvider: 'github', hostName: 'github.com' },
      ]);

      expect(result.size).toBe(1);
    });
  });

  describe('resolveProvidersToRun', () => {
    it('returns all providers and no invalid when repositoryNames is empty', () => {
      const providerMap = new Map<string, number>([
        ['a', 1],
        ['b', 2],
      ]);
      const allProviders = [1, 2];
      const { providersToRun, invalidRepositories } = resolveProvidersToRun(
        [],
        providerMap,
        allProviders,
      );
      expect(providersToRun).toEqual([1, 2]);
      expect(invalidRepositories).toEqual([]);
    });

    it('returns only providers for valid names', () => {
      const providerMap = new Map<string, string>([
        ['repo-a', 'p1'],
        ['repo-b', 'p2'],
      ]);
      const allProviders = ['p1', 'p2'];
      const { providersToRun, invalidRepositories } = resolveProvidersToRun(
        ['repo-a', 'repo-b'],
        providerMap,
        allProviders,
      );
      expect(providersToRun).toEqual(['p1', 'p2']);
      expect(invalidRepositories).toEqual([]);
    });

    it('returns only invalid names when none match the map', () => {
      const providerMap = new Map<string, string>([['repo-a', 'p1']]);
      const allProviders = ['p1'];
      const { providersToRun, invalidRepositories } = resolveProvidersToRun(
        ['unknown-1', 'unknown-2'],
        providerMap,
        allProviders,
      );
      expect(providersToRun).toEqual([]);
      expect(invalidRepositories).toEqual(['unknown-1', 'unknown-2']);
    });

    it('splits valid and invalid names when mixed', () => {
      const providerMap = new Map<string, string>([
        ['valid', 'p1'],
        ['also-valid', 'p2'],
      ]);
      const allProviders = ['p1', 'p2'];
      const { providersToRun, invalidRepositories } = resolveProvidersToRun(
        ['valid', 'invalid-repo', 'also-valid'],
        providerMap,
        allProviders,
      );
      expect(providersToRun).toEqual(['p1', 'p2']);
      expect(invalidRepositories).toEqual(['invalid-repo']);
    });

    it('preserves order of valid names', () => {
      const providerMap = new Map<string, string>([
        ['first', 'p1'],
        ['second', 'p2'],
        ['third', 'p3'],
      ]);
      const allProviders = ['p1', 'p2', 'p3'];
      const { providersToRun } = resolveProvidersToRun(
        ['second', 'first', 'third'],
        providerMap,
        allProviders,
      );
      expect(providersToRun).toEqual(['p2', 'p1', 'p3']);
    });
  });

  describe('buildInvalidRepositoryResults', () => {
    it('returns empty array for empty input', () => {
      const result = buildInvalidRepositoryResults([]);
      expect(result).toEqual([]);
    });

    it('returns one result per invalid repository with correct shape', () => {
      const result = buildInvalidRepositoryResults(['repo-a', 'repo-b']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        repositoryName: 'repo-a',
        status: 'invalid',
        error: {
          code: 'INVALID_REPOSITORY',
          message: "Repository 'repo-a' not found in configured providers",
        },
      });
      expect(result[1].repositoryName).toBe('repo-b');
      expect(result[1].error.message).toContain('repo-b');
    });

    it('uses INVALID_REPOSITORY code for all entries', () => {
      const result = buildInvalidRepositoryResults(['x']);
      expect(result[0].error.code).toBe('INVALID_REPOSITORY');
    });
  });

  describe('isSafeHostname', () => {
    it('returns true for gitlab.com', () => {
      expect(isSafeHostname('gitlab.com')).toBe(true);
    });
    it('returns true for single-label hostnames', () => {
      expect(isSafeHostname('localhost')).toBe(true);
    });
    it('returns true for hostnames with hyphens and subdomains', () => {
      expect(isSafeHostname('gitlab.enterprise.com')).toBe(true);
      expect(isSafeHostname('my-gitlab.example.com')).toBe(true);
    });
    it('returns false for empty string', () => {
      expect(isSafeHostname('')).toBe(false);
    });
    it('returns false when host contains path or scheme', () => {
      expect(isSafeHostname('https://evil.com')).toBe(false);
      expect(isSafeHostname('gitlab.com/path')).toBe(false);
      expect(isSafeHostname('gitlab.com/')).toBe(false);
    });
    it('returns false when host contains credentials or @', () => {
      expect(isSafeHostname('user@gitlab.com')).toBe(false);
      expect(isSafeHostname('gitlab.com@evil.com')).toBe(false);
    });
    it('returns false for non-string or too long', () => {
      expect(isSafeHostname(123 as unknown as string)).toBe(false);
      expect(isSafeHostname('a'.repeat(254))).toBe(false);
    });
  });

  describe('getSyncResponseStatusCode', () => {
    it('returns 400 when emptyRequest is true', () => {
      expect(
        getSyncResponseStatusCode({ results: [], emptyRequest: true }),
      ).toBe(400);
    });

    it('returns 400 when all results are invalid', () => {
      expect(
        getSyncResponseStatusCode({
          results: [{ status: 'invalid' }, { status: 'invalid' }],
          emptyRequest: false,
        }),
      ).toBe(400);
    });

    it('returns 400 when hasInvalid and hasFailures and no hasStarted', () => {
      expect(
        getSyncResponseStatusCode({
          results: [{ status: 'invalid' }, { status: 'failed' }],
          emptyRequest: false,
        }),
      ).toBe(400);
    });

    it('returns 500 when all results are failed', () => {
      expect(
        getSyncResponseStatusCode({
          results: [{ status: 'failed' }, { status: 'failed' }],
          emptyRequest: false,
        }),
      ).toBe(500);
    });

    it('returns 202 when all results are sync_started', () => {
      expect(
        getSyncResponseStatusCode({
          results: [{ status: 'sync_started' }, { status: 'sync_started' }],
          emptyRequest: false,
        }),
      ).toBe(202);
    });

    it('returns 200 when all results are already_syncing', () => {
      expect(
        getSyncResponseStatusCode({
          results: [
            { status: 'already_syncing' },
            { status: 'already_syncing' },
          ],
          emptyRequest: false,
        }),
      ).toBe(200);
    });

    it('returns 207 for mixed results', () => {
      expect(
        getSyncResponseStatusCode({
          results: [
            { status: 'sync_started' },
            { status: 'already_syncing' },
            { status: 'failed' },
          ],
          emptyRequest: false,
        }),
      ).toBe(207);
    });

    it('returns 207 when some started and some invalid', () => {
      expect(
        getSyncResponseStatusCode({
          results: [{ status: 'sync_started' }, { status: 'invalid' }],
          emptyRequest: false,
        }),
      ).toBe(207);
    });

    it('returns 400 for empty results when emptyRequest is true (empty wins)', () => {
      expect(
        getSyncResponseStatusCode({
          results: [],
          emptyRequest: true,
        }),
      ).toBe(400);
    });
  });

  describe('checkRequireSuperuser', () => {
    const mockCredentials = {};
    const mockUserEntityRef = 'user:default/alice';
    const mockToken = 'mock-token';

    function createMockReq(): any {
      return {};
    }

    function createMockRes() {
      const res: any = {
        statusCode: 200,
        status: jest.fn().mockImplementation(function statusImpl(
          this: any,
          code: number,
        ) {
          this.statusCode = code;
          return this;
        }),
        json: jest.fn().mockImplementation(function jsonImpl(this: any) {
          return this;
        }),
      };
      return res;
    }

    function createMockDeps(
      overrides: Partial<RequireSuperuserDeps> = {},
    ): RequireSuperuserDeps {
      return {
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(mockCredentials),
        } as any,
        userInfo: {
          getUserInfo: jest
            .fn()
            .mockResolvedValue({ userEntityRef: mockUserEntityRef }),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation((_: any, type: string) => type === 'user'),
          getPluginRequestToken: jest
            .fn()
            .mockResolvedValue({ token: mockToken }),
        } as any,
        catalogClient: {
          getEntityByRef: jest.fn().mockResolvedValue({
            metadata: {
              annotations: { 'aap.platform/is_superuser': 'true' },
            },
          }),
        } as any,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          child: jest.fn().mockReturnThis(),
        } as any,
        ...overrides,
      };
    }

    it('returns true when user has aap.platform/is_superuser annotation set to true', async () => {
      const deps = createMockDeps();
      const check = checkRequireSuperuser(deps);
      const req = createMockReq();
      const res = createMockRes();

      const result = await check(req, res);

      expect(result).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(deps.httpAuth.credentials).toHaveBeenCalledWith(req, {
        allow: ['service', 'user'],
      });
      expect(deps.userInfo.getUserInfo).toHaveBeenCalledWith(mockCredentials);
      expect(deps.catalogClient.getEntityByRef).toHaveBeenCalledWith(
        mockUserEntityRef,
        { token: mockToken },
      );
    });

    it('returns false and sends 403 when user lacks superuser annotation', async () => {
      const deps = createMockDeps({
        catalogClient: {
          getEntityByRef: jest.fn().mockResolvedValue({
            metadata: { annotations: {} },
          }),
        } as any,
      });
      const check = checkRequireSuperuser(deps);
      const req = createMockReq();
      const res = createMockRes();

      const result = await check(req, res);

      expect(result).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: superuser access required',
      });
    });

    it('returns false and sends 403 when annotation is not the string "true"', async () => {
      const deps = createMockDeps({
        catalogClient: {
          getEntityByRef: jest.fn().mockResolvedValue({
            metadata: {
              annotations: { 'aap.platform/is_superuser': 'false' },
            },
          }),
        } as any,
      });
      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: superuser access required',
      });
    });

    it('returns false and sends 500 when getUserInfo throws', async () => {
      const deps = createMockDeps({
        userInfo: {
          getUserInfo: jest.fn().mockRejectedValue(new Error('User not found')),
        } as any,
      });
      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(false);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization failed: User not found',
      });
      expect(deps.logger.error).toHaveBeenCalledWith(
        'Superuser check failed: User not found',
      );
    });

    it('returns true for service principal (external access token) when no subject allowlist', async () => {
      const serviceCredentials = {
        principal: { type: 'service' as const, subject: 'external-auth-token' },
      };
      const deps = createMockDeps({
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(serviceCredentials),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation((_: any, type: string) => type === 'service'),
          getPluginRequestToken: jest
            .fn()
            .mockResolvedValue({ token: mockToken }),
        } as any,
      });

      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(deps.auth.isPrincipal).toHaveBeenCalledWith(
        serviceCredentials,
        'service',
      );
      expect(deps.logger.info).toHaveBeenCalledWith(
        'Allowing sync request: external access (service principal, subject=external-auth-token)',
      );
      expect(deps.userInfo.getUserInfo).not.toHaveBeenCalled();
    });

    it('returns true for service principal when subject is in allowedExternalAccessSubjects', async () => {
      const serviceCredentials = {
        principal: { type: 'service' as const, subject: 'external-auth-token' },
      };
      const deps = createMockDeps({
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(serviceCredentials),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation((_: any, type: string) => type === 'service'),
          getPluginRequestToken: jest
            .fn()
            .mockResolvedValue({ token: mockToken }),
        } as any,
        allowedExternalAccessSubjects: ['external-auth-token', 'other-allowed'],
      });

      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(true);
      expect(deps.logger.info).toHaveBeenCalledWith(
        'Allowing sync request: external access (service principal, subject=external-auth-token)',
      );
    });

    it('returns false and sends 403 when service principal subject not in allowedExternalAccessSubjects', async () => {
      const serviceCredentials = {
        principal: { type: 'service' as const, subject: 'random-service' },
      };
      const deps = createMockDeps({
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(serviceCredentials),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation((_: any, type: string) => type === 'service'),
          getPluginRequestToken: jest
            .fn()
            .mockResolvedValue({ token: mockToken }),
        } as any,
        allowedExternalAccessSubjects: ['external-auth-token'],
      });

      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error:
          'Forbidden: external access subject not allowed for this endpoint',
      });
      expect(deps.logger.warn).toHaveBeenCalledWith(
        "Rejecting sync request: service principal subject 'random-service' not in allowedExternalAccessSubjects",
      );
    });

    it('returns false and sends 500 when credentials() throws (e.g. missing or not allowed)', async () => {
      const deps = createMockDeps({
        httpAuth: {
          credentials: jest
            .fn()
            .mockRejectedValue(new Error('Missing credentials')),
        } as any,
      });

      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(false);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization failed: Missing credentials',
      });
      expect(deps.httpAuth.credentials).toHaveBeenCalledWith(
        expect.anything(),
        { allow: ['service', 'user'] },
      );
    });

    it('returns false and sends 500 when getEntityByRef throws', async () => {
      const deps = createMockDeps({
        catalogClient: {
          getEntityByRef: jest
            .fn()
            .mockRejectedValue(new Error('Catalog error')),
        } as any,
      });
      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(false);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization failed: Catalog error',
      });
      expect(deps.logger.error).toHaveBeenCalledWith(
        'Superuser check failed: Catalog error',
      );
    });

    it('returns false and sends 500 when httpAuth.credentials throws', async () => {
      const deps = createMockDeps({
        httpAuth: {
          credentials: jest
            .fn()
            .mockRejectedValue(new Error('Missing credentials')),
        } as any,
      });
      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(false);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization failed: Missing credentials',
      });
    });

    it('handles non-Error throw by stringifying the value', async () => {
      const deps = createMockDeps({
        userInfo: {
          getUserInfo: jest.fn().mockRejectedValue('string error'),
        } as any,
      });
      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(false);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization failed: string error',
      });
    });

    it('returns false when userEntity is null/undefined', async () => {
      const deps = createMockDeps({
        catalogClient: {
          getEntityByRef: jest.fn().mockResolvedValue(null),
        } as any,
      });
      const check = checkRequireSuperuser(deps);
      const res = createMockRes();

      const result = await check(createMockReq(), res);

      expect(result).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: superuser access required',
      });
    });
  });

  describe('getGitLabIntegrationForHost', () => {
    it('returns empty object when no integrations configured', () => {
      const config = new ConfigReader({});
      const result = getGitLabIntegrationForHost(config, 'gitlab.com');
      expect(result).toEqual({});
    });

    it('returns empty object when integrations array is empty', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [],
        },
      });
      const result = getGitLabIntegrationForHost(config, 'gitlab.com');
      expect(result).toEqual({});
    });

    it('returns token for matching host', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [
            {
              host: 'gitlab.com',
              token: 'test-token',
            },
          ],
        },
      });
      const result = getGitLabIntegrationForHost(config, 'gitlab.com');
      expect(result).toEqual({ token: 'test-token', apiBaseUrl: undefined });
    });

    it('returns token and apiBaseUrl for matching host', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [
            {
              host: 'gitlab.example.com',
              token: 'my-token',
              apiBaseUrl: 'https://gitlab.example.com/api/v4/',
            },
          ],
        },
      });
      const result = getGitLabIntegrationForHost(config, 'gitlab.example.com');
      expect(result).toEqual({
        token: 'my-token',
        apiBaseUrl: 'https://gitlab.example.com/api/v4',
      });
    });

    it('strips trailing slash from apiBaseUrl', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [
            {
              host: 'gitlab.com',
              token: 'token',
              apiBaseUrl: 'https://gitlab.com/api/v4/',
            },
          ],
        },
      });
      const result = getGitLabIntegrationForHost(config, 'gitlab.com');
      expect(result.apiBaseUrl).toBe('https://gitlab.com/api/v4');
    });

    it('defaults host to gitlab.com when not specified', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [
            {
              token: 'default-token',
            },
          ],
        },
      });
      const result = getGitLabIntegrationForHost(config, 'gitlab.com');
      expect(result).toEqual({ token: 'default-token', apiBaseUrl: undefined });
    });

    it('returns empty object when host does not match', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [
            {
              host: 'gitlab.example.com',
              token: 'token',
            },
          ],
        },
      });
      const result = getGitLabIntegrationForHost(config, 'gitlab.other.com');
      expect(result).toEqual({});
    });

    it('finds correct host among multiple integrations', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [
            {
              host: 'gitlab.com',
              token: 'public-token',
            },
            {
              host: 'gitlab.internal.com',
              token: 'internal-token',
            },
          ],
        },
      });
      const result = getGitLabIntegrationForHost(config, 'gitlab.internal.com');
      expect(result).toEqual({
        token: 'internal-token',
        apiBaseUrl: undefined,
      });
    });
  });

  describe('isGitHubHostAllowedForProxy', () => {
    it('allows github.com when integrations.github is missing', () => {
      const config = new ConfigReader({});
      expect(isGitHubHostAllowedForProxy(config, 'github.com')).toBe(true);
    });

    it('allows github.com when integrations.github is empty', () => {
      const config = new ConfigReader({ integrations: { github: [] } });
      expect(isGitHubHostAllowedForProxy(config, 'github.com')).toBe(true);
    });

    it('rejects other hosts when integrations.github is missing', () => {
      const config = new ConfigReader({});
      expect(isGitHubHostAllowedForProxy(config, 'git.example.com')).toBe(
        false,
      );
    });

    it('allows a host that appears in integrations.github', () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'git.enterprise.com', token: 't' }],
        },
      });
      expect(isGitHubHostAllowedForProxy(config, 'git.enterprise.com')).toBe(
        true,
      );
    });

    it('matches default host github.com for an entry without host key', () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ token: 't' }],
        },
      });
      expect(isGitHubHostAllowedForProxy(config, 'github.com')).toBe(true);
    });
  });

  describe('isGitLabHostAllowedForProxy', () => {
    it('allows gitlab.com when integrations.gitlab is missing', () => {
      const config = new ConfigReader({});
      expect(isGitLabHostAllowedForProxy(config, 'gitlab.com')).toBe(true);
    });

    it('rejects other hosts when integrations.gitlab is missing', () => {
      const config = new ConfigReader({});
      expect(isGitLabHostAllowedForProxy(config, 'gitlab.internal.com')).toBe(
        false,
      );
    });

    it('allows a host that appears in integrations.gitlab', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [{ host: 'gitlab.internal.com', token: 't' }],
        },
      });
      expect(isGitLabHostAllowedForProxy(config, 'gitlab.internal.com')).toBe(
        true,
      );
    });
  });

  describe('createRequireSuperuserMiddleware', () => {
    const mockCredentials = {};
    const mockUserEntityRef = 'user:default/bob';
    const mockToken = 'mock-token';

    function createMockReq(): any {
      return {};
    }

    function createMockRes() {
      return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
    }

    function createMockDeps(superuser = true): RequireSuperuserDeps {
      return {
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(mockCredentials),
        } as any,
        userInfo: {
          getUserInfo: jest
            .fn()
            .mockResolvedValue({ userEntityRef: mockUserEntityRef }),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation((_: any, type: string) => type === 'user'),
          getPluginRequestToken: jest
            .fn()
            .mockResolvedValue({ token: mockToken }),
        } as any,
        catalogClient: {
          getEntityByRef: jest.fn().mockResolvedValue({
            metadata: {
              annotations: superuser
                ? { 'aap.platform/is_superuser': 'true' }
                : {},
            },
          }),
        } as any,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          child: jest.fn().mockReturnThis(),
        } as any,
      };
    }

    it('calls next() when superuser check returns true', async () => {
      const deps = createMockDeps(true);
      const middleware = createRequireSuperuserMiddleware(deps);
      const next = jest.fn();
      const req = createMockReq();
      const res = createMockRes();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('does not call next() when superuser check returns false', async () => {
      const deps = createMockDeps(false);
      const middleware = createRequireSuperuserMiddleware(deps);
      const next = jest.fn();
      const req = createMockReq();
      const res = createMockRes();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: superuser access required',
      });
    });

    it('does not call next() when check throws (sends 500)', async () => {
      const deps = createMockDeps(true);
      (deps.userInfo.getUserInfo as jest.Mock).mockRejectedValue(
        new Error('Auth failed'),
      );
      const middleware = createRequireSuperuserMiddleware(deps);
      const next = jest.fn();
      const res = createMockRes();

      await middleware(createMockReq(), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization failed: Auth failed',
      });
    });
  });

  describe('getGitHubIntegrationForHost', () => {
    it('returns empty object when no integrations configured', () => {
      const config = new ConfigReader({});
      expect(getGitHubIntegrationForHost(config, 'github.com')).toEqual({});
    });

    it('returns empty object when integrations array is empty', () => {
      const config = new ConfigReader({ integrations: { github: [] } });
      expect(getGitHubIntegrationForHost(config, 'github.com')).toEqual({});
    });

    it('returns token for matching host', () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'gh-token' }],
        },
      });
      const result = getGitHubIntegrationForHost(config, 'github.com');
      expect(result).toEqual({ token: 'gh-token', apiBaseUrl: undefined });
    });

    it('returns token and apiBaseUrl for matching host', () => {
      const config = new ConfigReader({
        integrations: {
          github: [
            {
              host: 'github.enterprise.com',
              token: 'ghe-token',
              apiBaseUrl: 'https://github.enterprise.com/api/v3/',
            },
          ],
        },
      });
      const result = getGitHubIntegrationForHost(
        config,
        'github.enterprise.com',
      );
      expect(result).toEqual({
        token: 'ghe-token',
        apiBaseUrl: 'https://github.enterprise.com/api/v3',
      });
    });

    it('strips trailing slash from apiBaseUrl', () => {
      const config = new ConfigReader({
        integrations: {
          github: [
            {
              host: 'github.com',
              token: 't',
              apiBaseUrl: 'https://api.github.com/',
            },
          ],
        },
      });
      expect(getGitHubIntegrationForHost(config, 'github.com').apiBaseUrl).toBe(
        'https://api.github.com',
      );
    });

    it('defaults host to github.com when not specified in config', () => {
      const config = new ConfigReader({
        integrations: { github: [{ token: 'default-token' }] },
      });
      expect(getGitHubIntegrationForHost(config, 'github.com')).toEqual({
        token: 'default-token',
        apiBaseUrl: undefined,
      });
    });

    it('returns empty object when host does not match', () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token' }],
        },
      });
      expect(getGitHubIntegrationForHost(config, 'other.com')).toEqual({});
    });

    it('finds correct host among multiple integrations', () => {
      const config = new ConfigReader({
        integrations: {
          github: [
            { host: 'github.com', token: 'public-token' },
            { host: 'ghe.corp.com', token: 'corp-token' },
          ],
        },
      });
      expect(getGitHubIntegrationForHost(config, 'ghe.corp.com')).toEqual({
        token: 'corp-token',
        apiBaseUrl: undefined,
      });
    });
  });

  describe('checkRequireUserOrExternalAccess', () => {
    function createEeAuthDeps(
      overrides: Partial<RequireUserOrExternalAccessDeps> = {},
    ): RequireUserOrExternalAccessDeps {
      return {
        httpAuth: {
          credentials: jest.fn().mockResolvedValue({ $user: true }),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation((_: unknown, type: string) => type === 'user'),
        } as any,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          child: jest.fn().mockReturnThis(),
        } as any,
        ...overrides,
      };
    }

    it('returns user credentials when principal is user', async () => {
      const userCreds = { principal: { type: 'user' } };
      const deps = createEeAuthDeps({
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(userCreds),
        } as any,
      });
      const check = checkRequireUserOrExternalAccess(deps);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const out = await check({} as any, res);
      expect(out).toBe(userCreds);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('allows service principal when subject is in allowlist', async () => {
      const svcCreds = { principal: { type: 'service', subject: 'bot-a' } };
      const deps = createEeAuthDeps({
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(svcCreds),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation(
              (_: unknown, type: string) => type === 'service',
            ),
        } as any,
        allowedExternalAccessSubjects: ['bot-a'],
      });
      const check = checkRequireUserOrExternalAccess(deps);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const out = await check({} as any, res);
      expect(out).toBe(svcCreds);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects service principal when subject not in allowlist', async () => {
      const svcCreds = { principal: { type: 'service', subject: 'evil' } };
      const deps = createEeAuthDeps({
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(svcCreds),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation(
              (_: unknown, type: string) => type === 'service',
            ),
        } as any,
        allowedExternalAccessSubjects: ['bot-a'],
      });
      const check = checkRequireUserOrExternalAccess(deps);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const out = await check({} as any, res);
      expect(out).toBeNull();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('sends 401 when credentials fail', async () => {
      const deps = createEeAuthDeps({
        httpAuth: {
          credentials: jest.fn().mockRejectedValue(new Error('no cookie')),
        } as any,
      });
      const check = checkRequireUserOrExternalAccess(deps);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const out = await check({} as any, res);
      expect(out).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('createRequireUserOrExternalAccessMiddleware', () => {
    it('sets res.locals and calls next when authenticated', async () => {
      const userCreds = { principal: { type: 'user' } };
      const deps: RequireUserOrExternalAccessDeps = {
        httpAuth: {
          credentials: jest.fn().mockResolvedValue(userCreds),
        } as any,
        auth: {
          isPrincipal: jest
            .fn()
            .mockImplementation((_: unknown, type: string) => type === 'user'),
        } as any,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          child: jest.fn().mockReturnThis(),
        } as any,
      };
      const middleware = createRequireUserOrExternalAccessMiddleware(deps);
      const next = jest.fn();
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        locals: {},
      };
      await middleware({} as any, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.locals[EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY]).toBe(
        userCreds,
      );
    });
  });

  describe('resolveGithubRepoForEeBuild', () => {
    it('resolves owner, repo, ref, eeDir and eeFileName from GitHub blob source-location', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/develop/my-ee/ee1.yml',
          },
        },
        spec: { type: 'execution-environment' },
      };
      expect(resolveGithubRepoForEeBuild(entity)).toEqual({
        host: 'github.com',
        owner: 'acme',
        repo: 'widgets',
        ref: 'develop',
        eeDir: 'my-ee',
        eeFileName: 'ee1.yml',
      });
    });

    it('prefers edit URL over source-location when both exist', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            [ANNOTATION_EDIT_URL]:
              'https://github.com/other/other-repo/blob/main/x.yml',
            'backstage.io/source-location':
              'url:https://github.com/acme/widgets/blob/develop/e.yml',
          },
        },
        spec: { type: 'execution-environment' },
      };
      expect(resolveGithubRepoForEeBuild(entity).owner).toBe('other');
    });

    it('applies git_ref override', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/org/repo/blob/main/a.yml',
          },
        },
        spec: { type: 'execution-environment' },
      };
      expect(resolveGithubRepoForEeBuild(entity, 'release-1.0').ref).toBe(
        'release-1.0',
      );
    });

    it('sets eeDir to "." when file is at repo root', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/org/repo/blob/main/ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      };
      const result = resolveGithubRepoForEeBuild(entity);
      expect(result.eeDir).toBe('.');
      expect(result.eeFileName).toBe('ee.yml');
    });

    it('omits eeDir/eeFileName when URL has no file path (tree URL)', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/org/repo/tree/main/',
          },
        },
        spec: { type: 'execution-environment' },
      };
      const result = resolveGithubRepoForEeBuild(entity);
      expect(result.eeDir).toBeUndefined();
      expect(result.eeFileName).toBeUndefined();
    });

    it('handles nested directory paths', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'ee1',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/org/repo/blob/main/envs/prod/ee.yml',
          },
        },
        spec: { type: 'execution-environment' },
      };
      const result = resolveGithubRepoForEeBuild(entity);
      expect(result.eeDir).toBe('envs/prod');
      expect(result.eeFileName).toBe('ee.yml');
    });

    it('throws when kind is not Component', () => {
      expect(() =>
        resolveGithubRepoForEeBuild({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Template',
          metadata: { name: 't' },
          spec: { type: 'execution-environment' },
        } as any),
      ).toThrow('Component');
    });

    it('throws when spec.type is not execution-environment', () => {
      expect(() =>
        resolveGithubRepoForEeBuild({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'x',
            annotations: {
              'backstage.io/source-location':
                'url:https://github.com/o/r/blob/main/a.yml',
            },
          },
          spec: { type: 'service' },
        } as any),
      ).toThrow('execution-environment');
    });

    it('throws for non-GitHub source URL', () => {
      expect(() =>
        resolveGithubRepoForEeBuild({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'x',
            annotations: {
              'backstage.io/source-location':
                'url:https://gitlab.com/group/project/-/blob/main/a.yml',
            },
          },
          spec: { type: 'execution-environment' },
        } as any),
      ).toThrow('GitHub');
    });
  });

  describe('parseGitHubRepoFromSourceUrl', () => {
    it('returns null for empty input', () => {
      expect(parseGitHubRepoFromSourceUrl(undefined)).toBeNull();
      expect(parseGitHubRepoFromSourceUrl('')).toBeNull();
      expect(parseGitHubRepoFromSourceUrl('  ')).toBeNull();
    });

    it('parses blob URL with file path', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/acme/repo/blob/main/ee1/ee.yml',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'acme',
        repo: 'repo',
        defaultRef: 'main',
        filePath: 'ee1/ee.yml',
      });
    });

    it('parses blob URL with nested directories', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/org/repo/blob/develop/envs/prod/my-ee.yml',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'org',
        repo: 'repo',
        defaultRef: 'develop',
        filePath: 'envs/prod/my-ee.yml',
      });
    });

    it('omits filePath when no segments follow ref', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/org/repo/tree/main/',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'org',
        repo: 'repo',
        defaultRef: 'main',
      });
      expect(result!.filePath).toBeUndefined();
    });

    it('parses owner/repo only URL with default ref', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/org/repo',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'org',
        repo: 'repo',
        defaultRef: 'main',
      });
      expect(result!.filePath).toBeUndefined();
    });

    it('strips url: prefix', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'url:https://github.com/org/repo/blob/main/dir/file.yml',
      );
      expect(result!.filePath).toBe('dir/file.yml');
    });

    it('returns null for non-http(s) protocol', () => {
      expect(parseGitHubRepoFromSourceUrl('ftp://github.com/o/r')).toBeNull();
    });

    it('parses /edit/ URL correctly', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/org/repo/edit/main/ee1/catalog-info.yaml',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'org',
        repo: 'repo',
        defaultRef: 'main',
        filePath: 'ee1/catalog-info.yaml',
      });
    });

    it('returns null for completely invalid URL', () => {
      expect(parseGitHubRepoFromSourceUrl('not-a-url-at-all')).toBeNull();
    });

    it('parses multi-segment ref release/2.5', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/acme/repo/blob/release/2.5/ee/file.yml',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'acme',
        repo: 'repo',
        defaultRef: 'release/2.5',
        filePath: 'ee/file.yml',
      });
    });

    it('treats plain-name segments before file as directories (ambiguous multi-segment ref)', () => {
      // feature/foo/bar is ambiguous: foo, bar have no version markers so
      // the heuristic cannot distinguish them from directory names.
      // Use gitRefOverride to supply the correct ref in these cases.
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/acme/repo/blob/feature/foo/bar/ee.yml',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'acme',
        repo: 'repo',
        defaultRef: 'feature',
        filePath: 'foo/bar/ee.yml',
      });
    });

    it('preserves single-segment ref with nested path', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/acme/repo/blob/main/ee/file.yml',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'acme',
        repo: 'repo',
        defaultRef: 'main',
        filePath: 'ee/file.yml',
      });
    });

    it('treats all segments as ref when no file extension found', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/acme/repo/tree/release/2.5',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'acme',
        repo: 'repo',
        defaultRef: 'release/2.5',
      });
    });

    it('parses tag-like ref with file', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/acme/repo/blob/v1.0.0/dir/file.yaml',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'acme',
        repo: 'repo',
        defaultRef: 'v1.0.0',
        filePath: 'dir/file.yaml',
      });
    });

    it('parses multi-segment ref with deeply nested file path', () => {
      const result = parseGitHubRepoFromSourceUrl(
        'https://github.com/org/repo/blob/release/v3/envs/prod/my-ee.yml',
      );
      expect(result).toEqual({
        host: 'github.com',
        owner: 'org',
        repo: 'repo',
        defaultRef: 'release/v3',
        filePath: 'envs/prod/my-ee.yml',
      });
    });
  });

  describe('assertSafeRepoRelativeEeDir', () => {
    it('allows a simple directory', () => {
      expect(() => assertSafeRepoRelativeEeDir('my-ee')).not.toThrow();
    });

    it('allows nested directories', () => {
      expect(() => assertSafeRepoRelativeEeDir('envs/prod')).not.toThrow();
    });

    it('throws for absolute path', () => {
      expect(() => assertSafeRepoRelativeEeDir('/etc/ee')).toThrow(
        'ee_dir must be relative',
      );
    });

    it('throws for path traversal', () => {
      expect(() => assertSafeRepoRelativeEeDir('foo/../bar')).toThrow(
        'path traversal',
      );
    });
  });

  describe('assertSafeEeFileName', () => {
    it('allows a simple file name', () => {
      expect(() => assertSafeEeFileName('ee.yml')).not.toThrow();
    });

    it('throws for path with forward slash', () => {
      expect(() => assertSafeEeFileName('dir/ee.yml')).toThrow(
        'file name without path separators',
      );
    });

    it('throws for path with backslash', () => {
      expect(() => assertSafeEeFileName('dir\\ee.yml')).toThrow(
        'file name without path separators',
      );
    });

    it('throws for dot', () => {
      expect(() => assertSafeEeFileName('.')).toThrow(
        'ee_file_name is invalid',
      );
    });

    it('throws for dotdot', () => {
      expect(() => assertSafeEeFileName('..')).toThrow(
        'ee_file_name is invalid',
      );
    });
  });

  describe('parseEeBuildRequestBody – edge cases', () => {
    const validBase = {
      entityRef: 'component:default/my-ee',
      customRegistryUrl: 'quay.io/org',
      imageName: 'my-ee',
      imageTag: 'latest',
      verifyTls: true,
    };

    it('throws when customRegistryUrl is too long', () => {
      expect(() =>
        parseEeBuildRequestBody({
          owner: 'o',
          repo: 'r',
          ...validBase,
          customRegistryUrl: 'a'.repeat(1025),
        }),
      ).toThrow('customRegistryUrl is too long');
    });

    it('throws when imageName is too long', () => {
      expect(() =>
        parseEeBuildRequestBody({
          owner: 'o',
          repo: 'r',
          ...validBase,
          imageName: 'a'.repeat(1025),
        }),
      ).toThrow('imageName is too long');
    });

    it('throws when imageTag is too long', () => {
      expect(() =>
        parseEeBuildRequestBody({
          owner: 'o',
          repo: 'r',
          ...validBase,
          imageTag: 'a'.repeat(257),
        }),
      ).toThrow('imageTag is too long');
    });

    it('throws when a field contains control characters', () => {
      expect(() =>
        parseEeBuildRequestBody({
          owner: 'o',
          repo: 'r',
          ...validBase,
          customRegistryUrl: 'quay.io/\x00evil',
        }),
      ).toThrow('contains invalid characters');
    });

    it('throws when registryType is empty string', () => {
      expect(() =>
        parseEeBuildRequestBody({
          owner: 'o',
          repo: 'r',
          ...validBase,
          registryType: '',
        }),
      ).toThrow('registryType must be a non-empty string');
    });

    it('throws when registryType contains control characters', () => {
      expect(() =>
        parseEeBuildRequestBody({
          owner: 'o',
          repo: 'r',
          ...validBase,
          registryType: 'quay\x01',
        }),
      ).toThrow('contains invalid characters');
    });

    it('accepts and trims valid registryType', () => {
      const result = parseEeBuildRequestBody({
        owner: 'o',
        repo: 'r',
        ...validBase,
        registryType: '  quay  ',
      });
      expect(result.registryType).toBe('quay');
    });
  });

  describe('resolveGithubRepoForEeBuild – edge cases', () => {
    it('throws when entity has no source annotation at all', () => {
      expect(() =>
        resolveGithubRepoForEeBuild({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'ee1', annotations: {} },
          spec: { type: 'execution-environment' },
        } as any),
      ).toThrow('missing a Git source annotation');
    });

    it('replaces catalog-info.yaml with entityName.yml', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'cloud-ee',
          annotations: {
            'backstage.io/edit-url':
              'https://github.com/org/repo/edit/main/ee1/catalog-info.yaml',
          },
        },
        spec: { type: 'execution-environment' },
      };
      const result = resolveGithubRepoForEeBuild(entity);
      expect(result.eeDir).toBe('ee1');
      expect(result.eeFileName).toBe('cloud-ee.yml');
    });

    it('sets eeFileName to undefined when catalog-info.yaml and entity name is empty', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: '',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/org/repo/blob/main/ee1/catalog-info.yaml',
          },
        },
        spec: { type: 'execution-environment' },
      };
      const result = resolveGithubRepoForEeBuild(entity);
      expect(result.eeDir).toBe('ee1');
      expect(result.eeFileName).toBeUndefined();
    });

    it('handles entity with undefined annotations (falls back to empty object)', () => {
      expect(() =>
        resolveGithubRepoForEeBuild({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'ee1' },
          spec: { type: 'execution-environment' },
        } as any),
      ).toThrow('missing a Git source annotation');
    });

    it('handles catalog-info.yaml when entity.metadata.name is undefined', () => {
      const entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/org/repo/blob/main/ee1/catalog-info.yaml',
          },
        },
        spec: { type: 'execution-environment' },
      };
      const result = resolveGithubRepoForEeBuild(entity as any);
      expect(result.eeDir).toBe('ee1');
      expect(result.eeFileName).toBeUndefined();
    });
  });

  describe('getSkipTlsVerifyHosts', () => {
    it('returns empty array when config not set', () => {
      const config = new ConfigReader({});
      const result = getSkipTlsVerifyHosts(config);
      expect(result).toEqual([]);
    });

    it('returns configured hosts', () => {
      const config = new ConfigReader({
        catalog: {
          ansible: {
            skipTlsVerifyForHosts: ['gitlab.internal.com', 'gitlab.dev.com'],
          },
        },
      });
      const result = getSkipTlsVerifyHosts(config);
      expect(result).toEqual(['gitlab.internal.com', 'gitlab.dev.com']);
    });

    it('returns empty array when array is empty', () => {
      const config = new ConfigReader({
        catalog: {
          ansible: {
            skipTlsVerifyForHosts: [],
          },
        },
      });
      const result = getSkipTlsVerifyHosts(config);
      expect(result).toEqual([]);
    });
  });

  describe('handleGitHubCIActivity', () => {
    let mockLogger: any;
    let mockDeps: CIActivityDeps;

    function createMockRequest(
      query: Record<string, string>,
      headers: Record<string, string> = {},
    ): any {
      return { query, headers };
    }

    function createMockResponse() {
      const res: any = {
        statusCode: 0,
        body: undefined,
        status: jest.fn().mockImplementation(function (
          this: any,
          code: number,
        ) {
          this.statusCode = code;
          return this;
        }),
        json: jest.fn().mockImplementation(function (this: any, data: any) {
          this.body = data;
          return this;
        }),
      };
      return res;
    }

    beforeEach(() => {
      mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      };
      mockDeps = {
        config: new ConfigReader({
          integrations: {
            github: [{ host: 'github.com', token: 'config-token' }],
          },
        }),
        logger: mockLogger,
        scmIntegrations: {
          github: {
            byHost: jest.fn().mockReturnValue({
              config: { token: 'config-token', apiBaseUrl: undefined },
            }),
          },
        } as any,
        githubCredentialsProvider: {
          getCredentials: jest.fn().mockResolvedValue({
            token: 'config-token',
            headers: {},
          }),
        } as any,
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns 400 when owner is missing', async () => {
      const req = createMockRequest({ provider: 'github', repo: 'my-repo' });
      const res = createMockResponse();
      await handleGitHubCIActivity(mockDeps, req, res, 10);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('owner, repo');
    });

    it('returns 400 when repo is missing', async () => {
      const req = createMockRequest({ provider: 'github', owner: 'my-owner' });
      const res = createMockResponse();
      await handleGitHubCIActivity(mockDeps, req, res, 10);
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for unsafe hostname', async () => {
      const req = createMockRequest({
        owner: 'o',
        repo: 'r',
        host: 'https://evil.com',
      });
      const res = createMockResponse();
      await handleGitHubCIActivity(mockDeps, req, res, 10);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid host');
    });

    it('returns 400 for disallowed host', async () => {
      const req = createMockRequest({
        owner: 'o',
        repo: 'r',
        host: 'internal.corp.com',
      });
      const res = createMockResponse();
      await handleGitHubCIActivity(mockDeps, req, res, 10);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('not allowed');
    });

    it('returns 400 when no token is available', async () => {
      const deps: CIActivityDeps = {
        ...mockDeps,
        config: new ConfigReader({}),
        scmIntegrations: {
          github: { byHost: jest.fn().mockReturnValue(undefined) },
        } as any,
        githubCredentialsProvider: {
          getCredentials: jest.fn().mockRejectedValue(new Error('no creds')),
        } as any,
      };
      const req = createMockRequest({ owner: 'o', repo: 'r' });
      const res = createMockResponse();
      await handleGitHubCIActivity(deps, req, res, 10);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Missing authorization');
    });

    it('fetches workflow runs and returns 200 on success', async () => {
      const workflowData = { workflow_runs: [{ id: 1 }] };
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => workflowData,
      } as Response);

      const req = createMockRequest({ owner: 'my-owner', repo: 'my-repo' });
      const res = createMockResponse();
      await handleGitHubCIActivity(mockDeps, req, res, 5);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(workflowData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'api.github.com/repos/my-owner/my-repo/actions/runs',
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        }),
      );
      mockFetch.mockRestore();
    });

    it('returns 502 when fetch throws', async () => {
      const mockFetch = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('Network error'));

      const req = createMockRequest({ owner: 'o', repo: 'r' });
      const res = createMockResponse();
      await handleGitHubCIActivity(mockDeps, req, res, 10);

      expect(res.statusCode).toBe(502);
      expect(res.body.error).toBe('Failed to fetch GitHub workflow runs');
      mockFetch.mockRestore();
    });

    it('falls back to Authorization header token when resolveGithubToken throws', async () => {
      const deps: CIActivityDeps = {
        ...mockDeps,
        config: new ConfigReader({
          integrations: { github: [{ host: 'github.com' }] },
        }),
        scmIntegrations: {
          github: { byHost: jest.fn().mockReturnValue(undefined) },
        } as any,
        githubCredentialsProvider: {
          getCredentials: jest.fn().mockRejectedValue(new Error('no token')),
        } as any,
      };

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ workflow_runs: [] }),
      } as Response);

      const req = createMockRequest(
        { owner: 'o', repo: 'r' },
        { authorization: 'Bearer header-token' },
      );
      const res = createMockResponse();
      await handleGitHubCIActivity(deps, req, res, 10);

      expect(res.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer header-token',
          }),
        }),
      );
      mockFetch.mockRestore();
    });

    it('uses per_page in the API URL', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ workflow_runs: [] }),
      } as Response);

      const req = createMockRequest({ owner: 'o', repo: 'r' });
      const res = createMockResponse();
      await handleGitHubCIActivity(mockDeps, req, res, 42);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('per_page=42'),
        expect.any(Object),
      );
      mockFetch.mockRestore();
    });

    it('uses GHE api base for non-github.com hosts', async () => {
      const gheDeps: CIActivityDeps = {
        ...mockDeps,
        config: new ConfigReader({
          integrations: {
            github: [
              {
                host: 'ghe.corp.com',
                token: 'ghe-token',
              },
            ],
          },
        }),
        scmIntegrations: {
          github: {
            byHost: jest.fn().mockReturnValue({
              config: { token: 'ghe-token', apiBaseUrl: undefined },
            }),
          },
        } as any,
        githubCredentialsProvider: {
          getCredentials: jest
            .fn()
            .mockResolvedValue({ token: 'ghe-token', headers: {} }),
        } as any,
      };

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ workflow_runs: [] }),
      } as Response);

      const req = createMockRequest({
        owner: 'o',
        repo: 'r',
        host: 'ghe.corp.com',
      });
      const res = createMockResponse();
      await handleGitHubCIActivity(gheDeps, req, res, 10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ghe.corp.com/api/v3'),
        expect.any(Object),
      );
      mockFetch.mockRestore();
    });
  });

  describe('handleGitLabCIActivity', () => {
    let mockLogger: any;
    let mockDeps: CIActivityDeps;

    function createMockRequest(
      query: Record<string, string>,
      headers: Record<string, string> = {},
    ): any {
      return { query, headers };
    }

    function createMockResponse() {
      const res: any = {
        statusCode: 0,
        body: undefined,
        status: jest.fn().mockImplementation(function (
          this: any,
          code: number,
        ) {
          this.statusCode = code;
          return this;
        }),
        json: jest.fn().mockImplementation(function (this: any, data: any) {
          this.body = data;
          return this;
        }),
      };
      return res;
    }

    beforeEach(() => {
      mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      };
      mockDeps = {
        config: new ConfigReader({
          integrations: {
            gitlab: [{ host: 'gitlab.com', token: 'gl-token' }],
          },
        }),
        logger: mockLogger,
        scmIntegrations: {} as any,
        githubCredentialsProvider: {} as any,
      };
    });

    it('returns 400 when projectPath is missing', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      await handleGitLabCIActivity(mockDeps, req, res, 10);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('projectPath');
    });

    it('returns 400 for unsafe hostname', async () => {
      const req = createMockRequest({
        projectPath: 'group/project',
        host: 'user@evil.com',
      });
      const res = createMockResponse();
      await handleGitLabCIActivity(mockDeps, req, res, 10);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid host');
    });

    it('returns 400 for disallowed host', async () => {
      const req = createMockRequest({
        projectPath: 'group/project',
        host: 'internal.corp.com',
      });
      const res = createMockResponse();
      await handleGitLabCIActivity(mockDeps, req, res, 10);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('not allowed');
    });

    it('returns 400 when no token is available', async () => {
      const deps: CIActivityDeps = {
        ...mockDeps,
        config: new ConfigReader({
          integrations: { gitlab: [{ host: 'gitlab.com' }] },
        }),
      };
      const req = createMockRequest({ projectPath: 'group/project' });
      const res = createMockResponse();
      await handleGitLabCIActivity(deps, req, res, 10);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Missing projectPath or authorization');
    });

    it('uses token from Authorization header when config has none', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });

      const deps: CIActivityDeps = {
        ...mockDeps,
        config: new ConfigReader({
          integrations: { gitlab: [{ host: 'gitlab.com' }] },
        }),
      };
      const req = createMockRequest(
        { projectPath: 'group/project' },
        { authorization: 'Bearer header-gl-token' },
      );
      const res = createMockResponse();
      await handleGitLabCIActivity(deps, req, res, 10);
      expect(res.statusCode).toBe(200);
    });

    it('defaults host to gitlab.com', async () => {
      mockGetPipelines.mockResolvedValue({
        ok: true,
        status: 200,
        data: [{ id: 1 }],
      });

      const req = createMockRequest({ projectPath: 'group/project' });
      const res = createMockResponse();
      await handleGitLabCIActivity(mockDeps, req, res, 10);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('parseEeBuildRequestBody', () => {
    const validBase = {
      entityRef: 'component:default/my-ee',
      customRegistryUrl: 'quay.io/org',
      imageName: 'my-ee',
      imageTag: 'latest',
      verifyTls: true,
    };

    it('accepts entityRef', () => {
      const result = parseEeBuildRequestBody({ ...validBase });
      expect(result.entityRef).toBe('component:default/my-ee');
      expect(result.owner).toBeUndefined();
    });

    it('accepts optional owner, repo, and host overrides', () => {
      const result = parseEeBuildRequestBody({
        ...validBase,
        owner: 'acme',
        repo: 'widgets',
        host: 'ghe.example.com',
      });
      expect(result.entityRef).toBe('component:default/my-ee');
      expect(result.owner).toBe('acme');
      expect(result.repo).toBe('widgets');
      expect(result.host).toBe('ghe.example.com');
    });

    it('omits owner/repo/host when not provided', () => {
      const result = parseEeBuildRequestBody({ ...validBase });
      expect(result.owner).toBeUndefined();
      expect(result.repo).toBeUndefined();
      expect(result.host).toBeUndefined();
    });

    it('throws when entityRef is missing', () => {
      const { entityRef: _, ...noEntityRef } = validBase;
      expect(() => parseEeBuildRequestBody(noEntityRef)).toThrow(
        'entityRef is required',
      );
    });

    it('throws when entityRef is missing even with owner/repo', () => {
      const { entityRef: _, ...noEntityRef } = validBase;
      expect(() =>
        parseEeBuildRequestBody({
          owner: 'acme',
          repo: 'widgets',
          ...noEntityRef,
        }),
      ).toThrow('entityRef is required');
    });

    it('throws when imageTag is missing', () => {
      expect(() =>
        parseEeBuildRequestBody({
          entityRef: 'component:default/my-ee',
          customRegistryUrl: 'quay.io/org',
          imageName: 'img',
          verifyTls: true,
        }),
      ).toThrow('imageTag is required');
    });

    it('throws when verifyTls is missing', () => {
      expect(() =>
        parseEeBuildRequestBody({
          entityRef: 'component:default/my-ee',
          customRegistryUrl: 'quay.io/org',
          imageName: 'img',
          imageTag: 'latest',
        }),
      ).toThrow('verifyTls is required and must be a boolean');
    });

    it('throws when verifyTls is not a boolean', () => {
      expect(() =>
        parseEeBuildRequestBody({
          entityRef: 'component:default/my-ee',
          customRegistryUrl: 'quay.io/org',
          imageName: 'img',
          imageTag: 'latest',
          verifyTls: 'yes',
        }),
      ).toThrow('verifyTls is required and must be a boolean');
    });

    it('throws for non-object body', () => {
      expect(() => parseEeBuildRequestBody(null)).toThrow(
        'Request body must be a JSON object',
      );
    });

    it('trims whitespace from fields', () => {
      const result = parseEeBuildRequestBody({
        owner: '  acme  ',
        repo: '  widgets  ',
        ...validBase,
      });
      expect(result.owner).toBe('acme');
      expect(result.repo).toBe('widgets');
    });
  });

  describe('createPermissionCheckMiddleware', () => {
    let mockHttpAuth: any;
    let mockPermissions: any;
    let deps: any;

    beforeEach(() => {
      mockHttpAuth = {
        credentials: jest
          .fn()
          .mockResolvedValue({ principal: { type: 'user' } }),
      };
      mockPermissions = {
        authorize: jest.fn().mockResolvedValue([]),
        authorizeConditional: jest.fn().mockResolvedValue([]),
      };
      deps = { httpAuth: mockHttpAuth, permissions: mockPermissions };
    });

    function makeMockReqRes() {
      const req = { headers: {} } as any;
      const res = {
        locals: {},
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const next = jest.fn();
      return { req, res, next };
    }

    it('attaches credentials and permission results to response.locals', async () => {
      const basicPerm = {
        type: 'basic' as const,
        name: 'test.view',
        attributes: {},
      };
      mockPermissions.authorize.mockResolvedValue([
        { result: AuthorizeResult.ALLOW },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [basicPerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.credentials).toEqual({ principal: { type: 'user' } });
      expect(res.locals.permissions).toEqual({ 'test.view': true });
      expect(next).toHaveBeenCalledWith();
    });

    it('maps DENY to false for basic permissions', async () => {
      const perm = {
        type: 'basic' as const,
        name: 'test.view',
        attributes: {},
      };
      mockPermissions.authorize.mockResolvedValue([
        { result: AuthorizeResult.DENY },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [perm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.permissions).toEqual({ 'test.view': false });
      expect(next).toHaveBeenCalled();
    });

    it('handles resource permissions via authorizeConditional', async () => {
      const resourcePerm = {
        type: 'resource' as const,
        name: 'catalog.entity.read',
        attributes: {},
        resourceType: 'catalog-entity',
      };
      mockPermissions.authorizeConditional.mockResolvedValue([
        { result: AuthorizeResult.CONDITIONAL },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [resourcePerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.permissions).toEqual({ 'catalog.entity.read': true });
      expect(next).toHaveBeenCalled();
    });

    it('maps DENY to false for resource permissions', async () => {
      const resourcePerm = {
        type: 'resource' as const,
        name: 'catalog.entity.read',
        attributes: {},
        resourceType: 'catalog-entity',
      };
      mockPermissions.authorizeConditional.mockResolvedValue([
        { result: AuthorizeResult.DENY },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [resourcePerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.permissions).toEqual({ 'catalog.entity.read': false });
    });

    it('handles mixed basic and resource permissions', async () => {
      const basicPerm = {
        type: 'basic' as const,
        name: 'ee.view',
        attributes: {},
      };
      const resourcePerm = {
        type: 'resource' as const,
        name: 'catalog.entity.read',
        attributes: {},
        resourceType: 'catalog-entity',
      };
      mockPermissions.authorize.mockResolvedValue([
        { result: AuthorizeResult.ALLOW },
      ]);
      mockPermissions.authorizeConditional.mockResolvedValue([
        { result: AuthorizeResult.CONDITIONAL },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [
        basicPerm,
        resourcePerm,
      ]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(res.locals.permissions).toEqual({
        'ee.view': true,
        'catalog.entity.read': true,
      });
    });

    it('skips authorize call when no basic permissions', async () => {
      const resourcePerm = {
        type: 'resource' as const,
        name: 'catalog.entity.read',
        attributes: {},
        resourceType: 'catalog-entity',
      };
      mockPermissions.authorizeConditional.mockResolvedValue([
        { result: AuthorizeResult.ALLOW },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [resourcePerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(mockPermissions.authorize).not.toHaveBeenCalled();
      expect(mockPermissions.authorizeConditional).toHaveBeenCalled();
    });

    it('skips authorizeConditional call when no resource permissions', async () => {
      const basicPerm = {
        type: 'basic' as const,
        name: 'ee.view',
        attributes: {},
      };
      mockPermissions.authorize.mockResolvedValue([
        { result: AuthorizeResult.ALLOW },
      ]);

      const middleware = createPermissionCheckMiddleware(deps, [basicPerm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(mockPermissions.authorizeConditional).not.toHaveBeenCalled();
    });

    it('calls next(err) when httpAuth.credentials throws', async () => {
      const perm = { type: 'basic' as const, name: 'ee.view', attributes: {} };
      const error = new Error('auth failed');
      mockHttpAuth.credentials.mockRejectedValue(error);

      const middleware = createPermissionCheckMiddleware(deps, [perm]);
      const { req, res, next } = makeMockReqRes();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('validateGitHubHost', () => {
    const configWithGithub = new ConfigReader({
      integrations: {
        github: [{ host: 'github.com', token: 'tok' }],
      },
    });

    it('returns undefined for a valid, allowed host', () => {
      expect(
        validateGitHubHost(configWithGithub, 'github.com'),
      ).toBeUndefined();
    });

    it('returns error for an unsafe hostname', () => {
      expect(validateGitHubHost(configWithGithub, '..evil')).toBe(
        'Invalid GitHub host in entity URL',
      );
    });

    it('returns error for a host not in integrations config', () => {
      expect(validateGitHubHost(configWithGithub, 'github.example.com')).toBe(
        "Host 'github.example.com' is not allowed. Configure it under integrations.github.",
      );
    });

    it('returns error for empty string', () => {
      expect(validateGitHubHost(configWithGithub, '')).toBe(
        'Invalid GitHub host in entity URL',
      );
    });
  });

  describe('isKnownEeBuildError', () => {
    it('returns true for messages containing "execution-environment"', () => {
      expect(
        isKnownEeBuildError('Entity must be an execution-environment'),
      ).toBe(true);
    });

    it('returns true for messages containing "GitHub"', () => {
      expect(isKnownEeBuildError('GitHub API returned 403')).toBe(true);
    });

    it('returns true for messages containing "source"', () => {
      expect(isKnownEeBuildError('Missing source annotation')).toBe(true);
    });

    it('returns true for messages containing "Component"', () => {
      expect(isKnownEeBuildError('Component kind not supported')).toBe(true);
    });

    it('returns false for an unrelated error message', () => {
      expect(isKnownEeBuildError('network timeout')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isKnownEeBuildError('')).toBe(false);
    });
  });

  describe('resolveEntityAndRepo', () => {
    const mockAuth = {
      getPluginRequestToken: jest.fn(),
    } as any;
    const mockCatalog = {
      getEntityByRef: jest.fn(),
    } as any;

    function makeRes() {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      return {
        res: { locals: {}, status, json } as any,
        status,
        json,
      };
    }

    it('returns 500 when credentials are missing from locals', async () => {
      const { res, status, json } = makeRes();
      const result = await resolveEntityAndRepo(
        res,
        mockAuth,
        mockCatalog,
        'component:default/my-ee',
      );
      expect(result).toBeUndefined();
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('missing auth context'),
        }),
      );
    });

    it('returns 404 when entity is not found', async () => {
      const { res, status, json } = makeRes();
      res.locals[EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY] = { token: 'tok' };
      mockAuth.getPluginRequestToken.mockResolvedValue({ token: 'cat-tok' });
      mockCatalog.getEntityByRef.mockResolvedValue(undefined);

      const result = await resolveEntityAndRepo(
        res,
        mockAuth,
        mockCatalog,
        'component:default/missing',
      );
      expect(result).toBeUndefined();
      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('not found'),
        }),
      );
    });

    it('returns resolved entity on success', async () => {
      const { res } = makeRes();
      res.locals[EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY] = { token: 'tok' };
      mockAuth.getPluginRequestToken.mockResolvedValue({ token: 'cat-tok' });
      mockCatalog.getEntityByRef.mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'my-ee',
          annotations: {
            'backstage.io/source-location':
              'url:https://github.com/acme/repo/tree/main/ee',
          },
        },
        spec: { type: 'execution-environment' },
      });

      const result = await resolveEntityAndRepo(
        res,
        mockAuth,
        mockCatalog,
        'component:default/my-ee',
      );
      expect(result).toBeDefined();
      expect(result!.gh.owner).toBe('acme');
      expect(result!.gh.repo).toBe('repo');
    });

    it('returns 403 when catalog throws ResponseError 403', async () => {
      const { res, status, json } = makeRes();
      res.locals[EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY] = { token: 'tok' };
      mockAuth.getPluginRequestToken.mockResolvedValue({ token: 'cat-tok' });

      const { ResponseError: RE } = require('@backstage/errors');
      const fakeResponse = {
        status: 403,
        statusText: 'Forbidden',
        ok: false,
        headers: { get: () => 'application/json', entries: () => [] },
        text: async () => '{"error":"Forbidden"}',
      };
      const respError = Object.create(RE.prototype);
      Object.assign(respError, new Error('Forbidden'));
      respError.name = 'ResponseError';
      respError.response = fakeResponse;
      respError.body = { error: 'Forbidden' };
      mockCatalog.getEntityByRef.mockRejectedValue(respError);

      const result = await resolveEntityAndRepo(
        res,
        mockAuth,
        mockCatalog,
        'component:default/my-ee',
      );
      expect(result).toBeUndefined();
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Not allowed'),
        }),
      );
    });

    it('returns 400 when resolveGithubRepoForEeBuild throws', async () => {
      const { res, status, json } = makeRes();
      res.locals[EE_BUILD_CATALOG_CREDENTIALS_LOCALS_KEY] = { token: 'tok' };
      mockAuth.getPluginRequestToken.mockResolvedValue({ token: 'cat-tok' });
      mockCatalog.getEntityByRef.mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'bad-ee', annotations: {} },
        spec: { type: 'execution-environment' },
      });

      const result = await resolveEntityAndRepo(
        res,
        mockAuth,
        mockCatalog,
        'component:default/bad-ee',
      );
      expect(result).toBeUndefined();
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('source annotation'),
        }),
      );
    });
  });

  describe('dispatchEeBuild', () => {
    const ghConfig = new ConfigReader({
      integrations: {
        github: [
          {
            host: 'github.com',
            token: 'tok',
            apiBaseUrl: 'https://api.github.com',
          },
        ],
      },
    });
    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;
    const gh = {
      host: 'github.com',
      owner: 'acme',
      repo: 'widgets',
      ref: 'main',
    };
    const parsedBody = {
      customRegistryUrl: 'quay.io/org',
      imageName: 'my-img',
      imageTag: 'latest',
      verifyTls: true,
    };

    function makeRes() {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      return {
        res: { locals: {}, status, json } as any,
        status,
        json,
      };
    }

    beforeEach(() => {
      mockDispatchActionsWorkflow.mockReset();
    });

    it('sends 202 on successful dispatch', async () => {
      mockDispatchActionsWorkflow.mockResolvedValue({
        ok: true,
        status: 200,
        workflowRunId: '123',
        workflowRunUrl: 'https://github.com/acme/widgets/actions/runs/123',
      });

      const { res, status, json } = makeRes();
      await dispatchEeBuild({
        response: res,
        logger: mockLogger,
        config: ghConfig,
        gh,
        eeDir: 'ee',
        eeFileName: 'ee.yml',
        githubToken: 'gh-tok',
        parsedBody,
      });

      expect(status).toHaveBeenCalledWith(202);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Build started',
          workflow_id: '123',
          workflow_url: 'https://github.com/acme/widgets/actions/runs/123',
        }),
      );
    });

    it('sends 202 without workflow_id when not returned', async () => {
      mockDispatchActionsWorkflow.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const { res, status, json } = makeRes();
      await dispatchEeBuild({
        response: res,
        logger: mockLogger,
        config: ghConfig,
        gh,
        eeDir: 'ee',
        eeFileName: 'ee.yml',
        githubToken: 'gh-tok',
        parsedBody,
      });

      expect(status).toHaveBeenCalledWith(202);
      expect(json).toHaveBeenCalledWith({ message: 'Build started' });
    });

    it('sends client error status on 4xx dispatch failure', async () => {
      mockDispatchActionsWorkflow.mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        bodyText: '{"message":"Unexpected inputs"}',
      });

      const { res, status, json } = makeRes();
      await dispatchEeBuild({
        response: res,
        logger: mockLogger,
        config: ghConfig,
        gh,
        eeDir: 'ee',
        eeFileName: 'ee.yml',
        githubToken: 'gh-tok',
        parsedBody,
      });

      expect(status).toHaveBeenCalledWith(422);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Unexpected inputs'),
        }),
      );
    });

    it('sends 502 on 5xx dispatch failure', async () => {
      mockDispatchActionsWorkflow.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        bodyText: '',
      });

      const { res, status, json } = makeRes();
      await dispatchEeBuild({
        response: res,
        logger: mockLogger,
        config: ghConfig,
        gh,
        eeDir: 'ee',
        eeFileName: 'ee.yml',
        githubToken: 'gh-tok',
        parsedBody,
      });

      expect(status).toHaveBeenCalledWith(502);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Internal Server Error'),
        }),
      );
    });

    it('passes correct workflow inputs', async () => {
      mockDispatchActionsWorkflow.mockResolvedValue({ ok: true, status: 200 });

      const { res } = makeRes();
      await dispatchEeBuild({
        response: res,
        logger: mockLogger,
        config: ghConfig,
        gh,
        eeDir: 'my/ee',
        eeFileName: 'ee.yml',
        githubToken: 'gh-tok',
        parsedBody,
      });

      expect(mockDispatchActionsWorkflow).toHaveBeenCalledWith(
        'acme',
        'widgets',
        'ee-build.yml',
        'main',
        {
          ee_dir: 'my/ee',
          ee_file_name: 'ee.yml',
          ee_registry: 'quay.io/org',
          ee_image_name: 'my-img',
          image_build_tag: 'latest',
          registry_tls_verify: 'true',
        },
      );
    });
  });

  describe('isScmIntegrationAuthFailure', () => {
    it('returns true for HTTP 401 in message', () => {
      expect(
        isScmIntegrationAuthFailure('Request failed with status code 401'),
      ).toBe(true);
    });

    it('returns true for bad credentials', () => {
      expect(isScmIntegrationAuthFailure('Bad credentials')).toBe(true);
    });

    it('returns true for expired token phrasing', () => {
      expect(isScmIntegrationAuthFailure('Token expired')).toBe(true);
    });

    it('returns false for not found', () => {
      expect(isScmIntegrationAuthFailure('not found')).toBe(false);
    });

    it('returns false for generic network errors', () => {
      expect(isScmIntegrationAuthFailure('Connection refused')).toBe(false);
    });

    it('returns true for oauth token phrasing', () => {
      expect(
        isScmIntegrationAuthFailure('Invalid oauth token for this request'),
      ).toBe(true);
    });

    it('returns false when only the substring oauth appears without oauth token', () => {
      expect(
        isScmIntegrationAuthFailure('OAuth app configuration updated'),
      ).toBe(false);
    });
  });
});
