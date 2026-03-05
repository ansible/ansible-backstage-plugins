import {
  formatNameSpace,
  resolveProvidersToRun,
  buildInvalidRepositoryResults,
  getSyncResponseStatusCode,
} from './helpers';

describe('helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatNameSpace', () => {
    it('normalizes name to lowercase with hyphens', () => {
      const result = formatNameSpace('test default ++test 123');
      expect(result).toEqual('test-default-test-123');
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
});
