import type { Entity } from '@backstage/catalog-model';
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  fetchGitFileContentFromBackend,
  getGitFileLocation,
  sourceFilePath,
} from './gitFileReader';

function sourceEntity(source: string, provider = 'github'): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'networking-ee',
      annotations: {
        'backstage.io/source-location': source,
        'ansible.io/scm-provider': provider,
      },
    },
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

it('resolves GitHub readme and definition paths from catalog source annotations', () => {
  const entity = sourceEntity(
    'url:https://github.com/ansible/networking-ee/tree/release/docs',
  );
  const location = getGitFileLocation(entity);

  expect(location).toEqual({
    scmProvider: 'github',
    host: 'github.com',
    owner: 'ansible',
    repo: 'networking-ee',
    ref: 'release',
    subdir: 'docs',
  });
  expect(sourceFilePath(location!, entity.metadata.name, 'readme')).toBe(
    'docs/README.md',
  );
  expect(sourceFilePath(location!, entity.metadata.name, 'definition')).toBe(
    'docs/networking-ee.yml',
  );
});

it.each([
  [
    'https://gitlab.example/team/automation/networking-ee/tree/release/ee/nested',
    {
      owner: 'team/automation',
      repo: 'networking-ee',
      ref: 'release',
      subdir: 'ee/nested',
    },
  ],
  [
    'https://gitlab.example/team/automation/networking-ee/blob/release/ee/nested/definition.yml',
    {
      owner: 'team/automation',
      repo: 'networking-ee',
      ref: 'release',
      subdir: 'ee/nested',
    },
  ],
  [
    'https://gitlab.example/team/automation/networking-ee/blob/release/definition.yml',
    {
      owner: 'team/automation',
      repo: 'networking-ee',
      ref: 'release',
      subdir: '',
    },
  ],
  [
    'https://gitlab.example/team/automation/networking-ee/-/tree/main/ee',
    {
      owner: 'team/automation',
      repo: 'networking-ee',
      ref: 'main',
      subdir: 'ee',
    },
  ],
  [
    'https://gitlab.example/team/automation/networking-ee/-/blob/main/ee/definition.yml',
    {
      owner: 'team/automation',
      repo: 'networking-ee',
      ref: 'main',
      subdir: 'ee',
    },
  ],
  [
    'https://gitlab.example/team/networking-ee',
    {
      owner: 'team',
      repo: 'networking-ee',
      ref: 'main',
      subdir: '',
    },
  ],
  [
    'https://gitlab.example/team/automation/networking-ee',
    {
      owner: 'team/automation',
      repo: 'networking-ee',
      ref: 'main',
      subdir: '',
    },
  ],
])('resolves GitLab source coordinates for %s', (source, expected) => {
  expect(getGitFileLocation(sourceEntity(source, 'gitlab'))).toEqual({
    scmProvider: 'gitlab',
    host: 'gitlab.example',
    ...expected,
  });
});

it('rejects unsupported providers, malformed URLs, and embedded credentials', () => {
  expect(
    getGitFileLocation(
      sourceEntity('https://user:secret@github.com/org/repo', 'github'),
    ),
  ).toBeUndefined();
  expect(getGitFileLocation(sourceEntity('not a URL'))).toBeUndefined();
  expect(
    getGitFileLocation(
      sourceEntity('https://example.com/org/repo', 'bitbucket'),
    ),
  ).toBeUndefined();
});

it('uses the catalog backend endpoint and returns file content', async () => {
  const location = getGitFileLocation(
    sourceEntity('https://github.com/ansible/networking-ee/tree/main/docs'),
  )!;
  const discoveryApi: DiscoveryApi = {
    getBaseUrl: jest.fn(async () => '/api/catalog'),
  };
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      new Response('# Source README', { status: 200 }),
  );
  const fetchApi: FetchApi = { fetch };

  const outcome = await fetchGitFileContentFromBackend(
    discoveryApi,
    fetchApi,
    location,
    'docs/README.md',
  );

  expect(outcome).toEqual({ ok: true, data: '# Source README' });
  expect(discoveryApi.getBaseUrl).toHaveBeenCalledWith('catalog');
  expect(fetch.mock.calls[0]?.[0]).toContain('/ansible/git/file-content?');
  expect(fetch.mock.calls[0]?.[0]).toContain('filePath=docs%2FREADME.md');
});

it('keeps integration authentication failures distinct from HTTP denial', async () => {
  const location = getGitFileLocation(
    sourceEntity('https://github.com/ansible/networking-ee'),
  )!;
  const discoveryApi: DiscoveryApi = {
    getBaseUrl: async () => '/api/catalog',
  };
  const fetchApi: FetchApi = {
    fetch: async () => jsonResponse({ code: 'INTEGRATION_AUTH_FAILED' }, 401),
  };

  await expect(
    fetchGitFileContentFromBackend(
      discoveryApi,
      fetchApi,
      location,
      'README.md',
    ),
  ).resolves.toEqual({ ok: false, reason: 'integration_auth' });
});

it.each([
  [403, 'access_denied'],
  [404, 'not_found'],
  [500, 'unavailable'],
] as const)(
  'classifies catalog backend HTTP %s responses as %s',
  async (status, reason) => {
    const location = getGitFileLocation(
      sourceEntity('https://github.com/ansible/networking-ee'),
    )!;
    const fetchApi: FetchApi = {
      fetch: async () => jsonResponse({ error: 'request failed' }, status),
    };

    await expect(
      fetchGitFileContentFromBackend(
        { getBaseUrl: async () => '/api/catalog' },
        fetchApi,
        location,
        'README.md',
      ),
    ).resolves.toEqual({ ok: false, reason });
  },
);

it('classifies transport failures as unavailable', async () => {
  const location = getGitFileLocation(
    sourceEntity('https://github.com/ansible/networking-ee'),
  )!;

  await expect(
    fetchGitFileContentFromBackend(
      { getBaseUrl: async () => '/api/catalog' },
      { fetch: async () => Promise.reject(new Error('network down')) },
      location,
      'README.md',
    ),
  ).resolves.toEqual({ ok: false, reason: 'unavailable' });
});
