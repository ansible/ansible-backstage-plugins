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
  createRequireSuperuserMiddleware,
  type RequireSuperuserDeps,
  isSafeHostname,
  getGitLabIntegrationForHost,
  getSkipTlsVerifyHosts,
} from './helpers';
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
});
