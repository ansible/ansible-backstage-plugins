/** @jest-environment node */
import { http, HttpResponse } from 'msw';
// The server API lives in the Node entry point in MSW 2.
// eslint-disable-next-line no-restricted-imports
import { setupServer } from 'msw/node';
import { AutomationContentClient } from './api';

describe('typed artifact listing', () => {
  const server = setupServer();
  const baseUrl = 'http://localhost/automation-content';
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => baseUrl },
    fetchApi: { fetch: (...args) => fetch(...args) },
  });
  const artifacts = [
    { ref: 'ee', type: 'execution-environment' },
    { ref: 'skill', type: 'skill' },
    { ref: 'collection', type: 'collection' },
    { ref: 'unclaimed', type: 'oci-image' },
  ];
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  beforeEach(() =>
    server.use(
      http.get(`${baseUrl}/content`, ({ request }) => {
        const type = new URL(request.url).searchParams.get('type');
        return HttpResponse.json({
          items: artifacts.filter(item => !type || item.type === type),
        });
      }),
    ),
  );

  it('excludes skills, collections and unclaimed images from EEs', async () => {
    expect(await client.listExecutionEnvironments()).toEqual([artifacts[0]]);
  });
  it.each(['skill', 'collection'] as const)(
    'filters %s artifacts',
    async type => {
      expect(await client.listArtifacts(type)).toEqual(
        artifacts.filter(item => item.type === type),
      );
    },
  );
  it('can list all artifacts explicitly', async () => {
    expect(await client.listArtifacts()).toEqual(artifacts);
  });

  it('requests the selected item type within the selected artifact', async () => {
    const requested = jest.fn();
    server.use(
      http.get(`${baseUrl}/content-items/:fqcn`, ({ request }) => {
        const url = new URL(request.url);
        requested({
          fqcn: url.pathname.split('/').pop(),
          in: url.searchParams.get('in'),
          type: url.searchParams.get('type'),
        });
        return HttpResponse.json({
          fqcn: 'ansible.builtin.same_name',
          variantCount: 2,
          variants: [
            {
              fqcn: 'ansible.builtin.same_name',
              type: 'callback',
              in: 'registry/repo@sha256:abc',
            },
            {
              fqcn: 'ansible.builtin.same_name',
              type: 'filter',
              in: 'registry/repo@sha256:abc',
            },
          ],
        });
      }),
    );

    const item = await client.getContentItem(
      'ansible.builtin.same_name',
      'registry/repo@sha256:abc',
      'filter',
    );

    expect(requested).toHaveBeenCalledWith({
      fqcn: 'ansible.builtin.same_name',
      in: 'registry/repo@sha256:abc',
      type: 'filter',
    });
    expect(item.type).toBe('filter');
  });

  it('keeps the legacy first-variant choice when no item type is requested', async () => {
    server.use(
      http.get(`${baseUrl}/content-items/:fqcn`, () =>
        HttpResponse.json({
          fqcn: 'ansible.builtin.same_name',
          variants: [
            {
              fqcn: 'ansible.builtin.same_name',
              type: 'callback',
              in: 'registry/repo@sha256:abc',
            },
            {
              fqcn: 'ansible.builtin.same_name',
              type: 'filter',
              in: 'registry/repo@sha256:abc',
            },
          ],
        }),
      ),
    );

    const item = await client.getContentItem(
      'ansible.builtin.same_name',
      'registry/repo@sha256:abc',
    );

    expect(item.type).toBe('callback');
  });

  it('rejects a malformed variants wrapper without calling array methods on it', async () => {
    server.use(
      http.get(`${baseUrl}/content-items/:fqcn`, () =>
        HttpResponse.json({
          fqcn: 'utopia-backup-validation',
          type: 'skill',
          variants: 'custom-author-field',
        }),
      ),
    );

    await expect(
      client.getContentItem('utopia-backup-validation', 'registry/skills'),
    ).rejects.toThrow(
      'Content API returned invalid variants for utopia-backup-validation: expected an array',
    );
  });

  it('preserves single-item detail and its top-level metadata', async () => {
    server.use(
      http.get(`${baseUrl}/content-items/:fqcn`, () =>
        HttpResponse.json({
          fqcn: 'utopia-backup-validation',
          name: 'utopia-backup-validation',
          type: 'skill',
          collection: '',
          collectionVersion: '0.4.2',
          authors: ['Utopia'],
          tags: ['operations'],
          documentation: 'https://example.test/docs',
          providedBy: ['registry/skills@sha256:abc'],
          enumeration: { status: 'complete', source: 'blob-fetch' },
        }),
      ),
    );

    const item = await client.getContentItem(
      'utopia-backup-validation',
      'registry/skills@sha256:abc',
    );

    expect(item).toMatchObject({
      type: 'skill',
      authors: ['Utopia'],
      tags: ['operations'],
      documentation: 'https://example.test/docs',
    });
  });
});
