import { fetchReadmeFromBackend } from './fetchReadme';

describe('fetchReadmeFromBackend', () => {
  const mockDiscoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('https://backstage.io/api/catalog'),
  };

  const mockFetchApi = {
    fetch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs correct URL with all parameters', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# README'),
    });

    await fetchReadmeFromBackend(mockDiscoveryApi as any, mockFetchApi as any, {
      scmProvider: 'github',
      scmHost: 'github.com',
      scmOrg: 'my-org',
      scmRepo: 'my-repo',
      filePath: 'README.md',
      gitRef: 'main',
    });

    expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledWith('catalog');
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://backstage.io/api/catalog/ansible/git/file-content?',
      ),
    );

    const fetchUrl = mockFetchApi.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('scmProvider=github');
    expect(fetchUrl).toContain('host=github.com');
    expect(fetchUrl).toContain('owner=my-org');
    expect(fetchUrl).toContain('repo=my-repo');
    expect(fetchUrl).toContain('filePath=README.md');
    expect(fetchUrl).toContain('ref=main');
  });

  it('returns README content on successful response', async () => {
    const readmeContent = '# Hello World\n\nThis is a test.';
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(readmeContent),
    });

    const result = await fetchReadmeFromBackend(
      mockDiscoveryApi as any,
      mockFetchApi as any,
      {
        scmProvider: 'github',
        scmHost: 'github.com',
        scmOrg: 'org',
        scmRepo: 'repo',
        filePath: 'README.md',
        gitRef: 'main',
      },
    );

    expect(result).toBe(readmeContent);
  });

  it('returns empty string on failed response', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchReadmeFromBackend(
      mockDiscoveryApi as any,
      mockFetchApi as any,
      {
        scmProvider: 'github',
        scmHost: 'github.com',
        scmOrg: 'org',
        scmRepo: 'repo',
        filePath: 'README.md',
        gitRef: 'main',
      },
    );

    expect(result).toBe('');
  });

  it('handles GitLab provider', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('GitLab README'),
    });

    const result = await fetchReadmeFromBackend(
      mockDiscoveryApi as any,
      mockFetchApi as any,
      {
        scmProvider: 'gitlab',
        scmHost: 'gitlab.com',
        scmOrg: 'group',
        scmRepo: 'project',
        filePath: 'docs/README.md',
        gitRef: 'develop',
      },
    );

    expect(result).toBe('GitLab README');

    const fetchUrl = mockFetchApi.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('scmProvider=gitlab');
    expect(fetchUrl).toContain('host=gitlab.com');
    expect(fetchUrl).toContain('filePath=docs%2FREADME.md');
  });

  it('properly encodes URL parameters with special characters', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('content'),
    });

    await fetchReadmeFromBackend(mockDiscoveryApi as any, mockFetchApi as any, {
      scmProvider: 'github',
      scmHost: 'github.enterprise.com',
      scmOrg: 'org/with/slashes',
      scmRepo: 'repo name',
      filePath: 'path/to/README.md',
      gitRef: 'feature/branch',
    });

    const fetchUrl = mockFetchApi.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('owner=org%2Fwith%2Fslashes');
    expect(fetchUrl).toContain('repo=repo+name');
    expect(fetchUrl).toContain('filePath=path%2Fto%2FREADME.md');
    expect(fetchUrl).toContain('ref=feature%2Fbranch');
  });

  it('uses discovery API to get base URL', async () => {
    mockDiscoveryApi.getBaseUrl.mockResolvedValue('https://custom.api/catalog');
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('content'),
    });

    await fetchReadmeFromBackend(mockDiscoveryApi as any, mockFetchApi as any, {
      scmProvider: 'github',
      scmHost: 'github.com',
      scmOrg: 'org',
      scmRepo: 'repo',
      filePath: 'README.md',
      gitRef: 'main',
    });

    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://custom.api/catalog/ansible/git/file-content',
      ),
    );
  });
});
