import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
  mockApis,
} from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import {
  catalogApiRef,
  MockStarredEntitiesApi,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';
import { Link, Route, Routes } from 'react-router-dom';
import {
  automationContentApiRef,
  type Collection,
  type ContentItemSummary,
  type SyncResult,
} from '../../api';
import { CollectionsCatalogPage } from './CollectionsCatalogPage';
import { CollectionDetailsPage } from './CollectionDetailsPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/collections',
}));
jest.mock('../ContentItemDocumentation', () => ({
  ContentItemDocumentation: ({
    fqcn,
    inArtifact,
  }: {
    fqcn: string;
    inArtifact?: string;
  }) => (
    <h1>
      {fqcn} in {inArtifact}
    </h1>
  ),
}));
jest.mock('@ansible/portal-plugin-sdk', () => ({
  useIsSuperuser: () => ({ isSuperuser: true }),
}));

const first: Collection = {
  namespace: 'ns',
  name: 'name_with.dots',
  fqcn: 'ns.name_with.dots',
  version: '1.9.0',
  description: '',
  counts: { plugins: 2 },
  providedBy: ['r/ee@sha256:one'],
};
const items = [
  first,
  { ...first, providedBy: ['r/ee@sha256:two'] },
  { ...first, version: '1.10.0' },
];
const catalogEntities = [
  {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'collection-ee-name_with-dots-1-9-0',
      namespace: 'default',
      annotations: {
        'ansible.com/collection': 'ns.name_with.dots',
        'ansible.com/version': '1.9.0',
      },
      tags: ['ansible-collection', 'eda'],
    },
    spec: { type: 'ansible-collection' },
  },
  {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'collection-ee-two-name_with-dots-1-9-0',
      namespace: 'default',
      annotations: {
        'ansible.com/collection': 'ns.name_with.dots',
        'ansible.com/version': '1.9.0',
      },
      tags: ['ansible-collection', 'eda'],
    },
    spec: { type: 'ansible-collection' },
  },
  {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'collection-ee-name_with-dots-1-10-0',
      namespace: 'default',
      annotations: {
        'ansible.com/collection': 'ns.name_with.dots',
        'ansible.com/version': '1.10.0',
      },
      tags: ['ansible-collection', 'eda'],
    },
    spec: { type: 'ansible-collection' },
  },
];
const api = {
  listCollections: jest.fn(async (query?: string) =>
    query === 'missing' ? [] : items,
  ),
  listRegistries: jest.fn(async () => [
    {
      name: 'r',
      url: 'https://registry.example.test',
      lastReconciledAt: new Date().toISOString(),
      lastReconcileOk: true,
    },
  ]),
  syncAll: jest.fn(
    async (): Promise<SyncResult> => ({
      status: 'completed' as const,
      durationMs: 10,
      registries: [{ registry: 'r', ok: true, discovered: 3 }],
    }),
  ),
  searchContentItems: jest.fn(
    async (): Promise<{ totalItems: number; items: ContentItemSummary[] }> => ({
      totalItems: 0,
      items: [],
    }),
  ),
};
const catalogApi = {
  queryEntities: jest.fn(async () => ({
    items: catalogEntities,
    totalItems: catalogEntities.length,
    pageInfo: {},
  })),
};

beforeAll(() => {
  // React Aria escapes meta selectors when opening the tag popover.
  // jsdom lacks this browser API; match the other content component tests.
  const cssApi = globalThis.CSS ?? ({} as typeof CSS);
  cssApi.escape ??= value => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: cssApi,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
});

function mount(path: string, starredApi = new MockStarredEntitiesApi()) {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [permissionApiRef, mockApis.permission()],
        [automationContentApiRef, api],
        [catalogApiRef, catalogApi],
        [starredEntitiesApiRef, starredApi],
      ]}
    >
      <Routes>
        <Route path="/" element={<CollectionsCatalogPage />} />
        <Route
          path="/:namespace/:name"
          element={
            <>
              <Link to="/other/missing">Another collection</Link>
              <CollectionDetailsPage />
            </>
          }
        />
      </Routes>
    </TestApiProvider>,
    { routeEntries: [path] },
  );
}

it('shows a compact latest-version card without provider digests', async () => {
  await mount('/');
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Collections' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'About collections' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('region', { name: 'Collections catalog' }),
  ).toBeTruthy();
  expect(
    await screen.findByRole('link', { name: 'ns.name_with.dots' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'Ansible collections (1)',
    }),
  ).toBeTruthy();
  expect(screen.getByText('v1.10.0')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Source' }).textContent).toContain(
    'External registry',
  );
  expect(screen.queryByRole('group', { name: 'Repository' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'All sources Source type' }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: /All registries/ })).toBeNull();
  expect(screen.queryByText('r/ee@sha256:two')).toBeNull();
  expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  expect(api.listRegistries).toHaveBeenCalledTimes(1);
  expect(catalogApi.queryEntities).toHaveBeenCalledWith(
    expect.objectContaining({
      limit: 1000,
      query: expect.objectContaining({
        $all: expect.arrayContaining([
          expect.objectContaining({
            'metadata.annotations.ansible.com/collection': {
              $in: ['ns.name_with.dots'],
            },
          }),
          expect.objectContaining({
            'metadata.annotations.ansible.com/version': {
              $in: ['1.10.0'],
            },
          }),
        ]),
      }),
      fields: expect.arrayContaining(['metadata.annotations', 'metadata.tags']),
    }),
  );
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'missing' },
  });
  expect(
    await screen.findByText('No collections match your search or filters'),
  ).toBeTruthy();
  expect(api.listCollections).toHaveBeenLastCalledWith('missing');
});

it('looks up only latest identities when total collection versions exceed the cap', async () => {
  api.listCollections.mockResolvedValueOnce([
    ...items,
    ...Array.from({ length: 501 }, (_, index) => ({
      ...first,
      version: `0.0.${index}`,
    })),
  ]);
  await mount('/');
  const favorites = await screen.findByRole('button', {
    name: 'Favorites, 0',
  });
  expect(favorites.hasAttribute('disabled')).toBe(false);
  expect(
    screen
      .getByRole('button', {
        name: /Add ns.name_with.dots v1.10.0 to favorites/,
      })
      .hasAttribute('disabled'),
  ).toBe(false);
  expect(catalogApi.queryEntities).toHaveBeenCalledTimes(1);
  expect(catalogApi.queryEntities).toHaveBeenCalledWith(
    expect.objectContaining({
      query: expect.objectContaining({
        $all: expect.arrayContaining([
          {
            'metadata.annotations.ansible.com/version': {
              $in: ['1.10.0'],
            },
          },
        ]),
      }),
    }),
  );
});

it('keeps an active tag filter loading until newly displayed identities have metadata', async () => {
  await mount('/');
  fireEvent.click(await screen.findByRole('button', { name: 'All tags Tags' }));
  fireEvent.click(await screen.findByRole('option', { name: 'eda' }));
  const other = {
    ...first,
    namespace: 'other',
    name: 'tagged',
    fqcn: 'other.tagged',
  };
  let resolveMetadata!: (
    result: Awaited<ReturnType<typeof catalogApi.queryEntities>>,
  ) => void;
  const pendingMetadata = new Promise<
    Awaited<ReturnType<typeof catalogApi.queryEntities>>
  >(resolve => {
    resolveMetadata = resolve;
  });
  api.listCollections.mockResolvedValueOnce([other]);
  catalogApi.queryEntities.mockReturnValueOnce(pendingMetadata);
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'tagged' },
  });
  await waitFor(() =>
    expect(catalogApi.queryEntities).toHaveBeenCalledTimes(2),
  );
  expect(screen.getByLabelText('Loading collections')).toBeTruthy();
  expect(
    screen.queryByText('No collections match your search or filters'),
  ).toBeNull();
  expect(
    screen.queryByRole('heading', { name: 'Ansible collections (0)' }),
  ).toBeNull();
  expect(screen.queryByRole('link', { name: other.fqcn })).toBeNull();
  await act(async () => {
    resolveMetadata({
      items: [
        {
          ...catalogEntities[0],
          metadata: {
            ...catalogEntities[0].metadata,
            annotations: {
              'ansible.com/collection': other.fqcn,
              'ansible.com/version': other.version,
            },
          },
        },
      ],
      totalItems: 1,
      pageInfo: {},
    });
  });
  expect(await screen.findByRole('link', { name: other.fqcn })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'eda Tags' })).toBeTruthy();
});

it('opens dotted collection details with version context and provider aggregation', async () => {
  await mount('/ns/name_with.dots?version=1.9.0');
  expect(await screen.findByText('Version 1.9.0')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'r/ee@sha256:one' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'r/ee@sha256:two' })).toBeTruthy();
});

it('reuses the collection list when navigating between collection details', async () => {
  await mount('/ns/name_with.dots');
  await screen.findByText('Version 1.10.0');
  fireEvent.click(screen.getByRole('link', { name: 'Another collection' }));
  await screen.findByText('Collection not found');
  expect(api.listCollections).toHaveBeenCalledTimes(1);
});

it('shows all computed versions when latest-only is turned off', async () => {
  await mount('/');
  await screen.findByText('v1.10.0');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Show latest version only' }),
  );
  expect(screen.getAllByText('v1.9.0')).toHaveLength(1);
  expect(screen.getByText('v1.10.0')).toBeTruthy();
  expect(
    screen
      .getAllByRole('link', { name: 'ns.name_with.dots' })
      .map(link => link.getAttribute('href')),
  ).toEqual([
    '/content/collections/ns/name_with.dots?version=1.10.0',
    '/content/collections/ns/name_with.dots?version=1.9.0',
  ]);
});

it('returns to the first page when the collection scope changes', async () => {
  const collections = Array.from({ length: 15 }, (_, index) => ({
    ...first,
    name: `collection-${index}`,
    fqcn: `ns.collection-${index}`,
  }));
  const entities = collections.map((collection, index) => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: `collection-${index}`,
      namespace: 'default',
      annotations: {
        'ansible.com/collection': collection.fqcn,
        'ansible.com/version': collection.version,
      },
      tags: ['ansible-collection'],
    },
    spec: { type: 'ansible-collection' },
  }));
  const starredApi = new MockStarredEntitiesApi();
  await Promise.all(
    entities.map(entity =>
      starredApi.toggleStarred(`component:default/${entity.metadata.name}`),
    ),
  );
  api.listCollections.mockResolvedValueOnce(collections);
  catalogApi.queryEntities.mockResolvedValueOnce({
    items: entities,
    totalItems: entities.length,
    pageInfo: {},
  });

  await mount('/', starredApi);
  expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 2 of 2')).toBeTruthy();
  expect(screen.getByRole('link', { name: collections[7].fqcn })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Favorites, 15' }));
  expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
  expect(screen.getByRole('link', { name: collections[0].fqcn })).toBeTruthy();
  expect(screen.queryByRole('link', { name: collections[7].fqcn })).toBeNull();
});

it('uses concise provider counts in version options and retains provider links', async () => {
  const versions = [
    { ...first, version: '3.0.0', providedBy: [] },
    { ...first, version: '2.0.0', providedBy: ['r/ee@sha256:one'] },
    {
      ...first,
      version: '1.9.0',
      providedBy: ['r/ee@sha256:one', 'r/ee@sha256:two'],
    },
  ];
  api.listCollections.mockResolvedValueOnce(versions);
  await mount('/ns/name_with.dots?version=3.0.0');
  await screen.findByText('Version 3.0.0');

  fireEvent.click(screen.getByRole('button', { name: /Collection version/ }));
  expect(
    await screen.findByRole('option', {
      name: '3.0.0 — No providers reported',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('option', {
      name: '2.0.0 — 1 execution environment',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('option', {
      name: '1.9.0 — 2 execution environments',
    }),
  ).toBeTruthy();

  fireEvent.click(
    screen.getByRole('option', { name: '2.0.0 — 1 execution environment' }),
  );
  expect(await screen.findByText('Version 2.0.0')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Execution Environments' }));
  expect(await screen.findByRole('grid')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'r/ee@sha256:one' })).toHaveLength(
    2,
  );
  expect(screen.getByRole('link', { name: 'r/ee@sha256:two' })).toBeTruthy();
});

it('uses exact collection catalog identities for real favorites and tag facets', async () => {
  const starredApi = new MockStarredEntitiesApi();
  await starredApi.toggleStarred(
    'component:default/collection-ee-name_with-dots-1-10-0',
  );
  await mount('/', starredApi);

  expect(
    await screen.findByRole('button', { name: 'Favorites, 1' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: /Remove ns.name_with.dots v1.10.0 from favorites/,
    }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Favorites, 1' }));
  expect(
    await screen.findByRole('heading', { name: 'Ansible collections (1)' }),
  ).toBeTruthy();
  expect(screen.getByText('v1.10.0')).toBeTruthy();
  expect(screen.queryByText('v1.9.0')).toBeNull();
});

it.each(['success', 'error', 'absence'] as const)(
  'retains Favorites while search metadata is pending and after %s',
  async outcome => {
    const starredApi = new MockStarredEntitiesApi();
    await starredApi.toggleStarred(
      'component:default/collection-ee-name_with-dots-1-10-0',
    );
    await mount('/', starredApi);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Favorites, 1' }),
    );
    const other = {
      ...first,
      namespace: 'other',
      name: 'unstarred',
      fqcn: 'other.unstarred',
    };
    let resolveMetadata: (
      result: Awaited<ReturnType<typeof catalogApi.queryEntities>>,
    ) => void = () => {};
    let rejectMetadata: (reason: Error) => void = () => {};
    const pendingMetadata = new Promise<
      Awaited<ReturnType<typeof catalogApi.queryEntities>>
    >((resolve, reject) => {
      resolveMetadata = resolve;
      rejectMetadata = reject;
    });
    api.listCollections.mockResolvedValueOnce([...items, other]);
    catalogApi.queryEntities.mockReturnValueOnce(pendingMetadata);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'matches' },
    });
    await waitFor(() =>
      expect(api.listCollections).toHaveBeenLastCalledWith('matches'),
    );
    await waitFor(() =>
      expect(catalogApi.queryEntities).toHaveBeenCalledTimes(2),
    );
    expect(
      screen
        .getByRole('button', { name: /Favorites/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByLabelText('Loading collections')).toBeTruthy();
    expect(screen.queryByText('No starred collections')).toBeNull();
    expect(screen.queryByRole('link', { name: other.fqcn })).toBeNull();
    await act(async () => {
      if (outcome === 'error')
        rejectMetadata(new Error('metadata unavailable'));
      else
        resolveMetadata({
          items: outcome === 'success' ? catalogEntities : [],
          totalItems: outcome === 'success' ? catalogEntities.length : 0,
          pageInfo: {},
        });
    });
    expect(
      screen
        .getByRole('button', { name: /Favorites/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByRole('link', { name: other.fqcn })).toBeNull();
    const expectedText = {
      success: 'Ansible collections (1)',
      error: /Unable to load matching collection catalog details/,
      absence: 'No starred collections',
    }[outcome];
    expect(await screen.findByText(expectedText)).toBeTruthy();
  },
);

it('retains Favorites when a search has no collection results', async () => {
  const starredApi = new MockStarredEntitiesApi();
  await starredApi.toggleStarred(
    'component:default/collection-ee-name_with-dots-1-10-0',
  );
  await mount('/', starredApi);
  fireEvent.click(await screen.findByRole('button', { name: 'Favorites, 1' }));
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'missing' },
  });
  await screen.findByText('No starred collections');
  expect(
    screen
      .getByRole('button', { name: /Favorites/ })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    screen.getByRole('button', { name: /All,/ }).getAttribute('aria-pressed'),
  ).toBe('false');
});

it('reports successful registry sync from the real sync API', async () => {
  await mount('/');
  await screen.findByRole('link', { name: 'ns.name_with.dots' });
  fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
  expect(
    await screen.findByText('Sync completed: 1 registries checked.'),
  ).toBeTruthy();
  expect(api.syncAll).toHaveBeenCalledTimes(1);
});

it('reports partial registry sync results without masking the failed source', async () => {
  api.syncAll.mockResolvedValueOnce({
    status: 'partial',
    durationMs: 20,
    registries: [
      {
        registry: 'r',
        ok: false,
        discovered: 0,
        error: 'Registry unavailable',
      },
    ],
  });
  await mount('/');
  await screen.findByRole('link', { name: 'ns.name_with.dots' });
  fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
  expect(
    await screen.findByText(
      'Sync partially completed: 0 of 1 registries succeeded. Failed: r.',
    ),
  ).toBeTruthy();
});

it('surfaces a rejected sync request as an error', async () => {
  api.syncAll.mockRejectedValueOnce(new Error('Content service unavailable'));
  await mount('/');
  await screen.findByRole('link', { name: 'ns.name_with.dots' });
  fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
  expect(
    await screen.findByText('Sync failed: Content service unavailable'),
  ).toBeTruthy();
});

it('shows an error rather than an empty catalog when loading fails', async () => {
  api.listCollections.mockRejectedValueOnce(new Error('Unavailable'));
  await mount('/');
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Unable to load collections.',
  );
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByText('No collections found')).toBeNull();
  expect(screen.queryByText('Latest: 1.10.0')).toBeNull();
});

it('distinguishes a missing collection from a failed detail request', async () => {
  await mount('/other/missing');
  expect(await screen.findByText('Collection not found')).toBeTruthy();
  expect(screen.queryByRole('tablist')).toBeNull();
});

it('searches contents using collection identity', async () => {
  await mount('/ns/name_with.dots?tab=content');
  await screen.findByText('No content items found');
  expect(api.searchContentItems).toHaveBeenCalledWith(
    expect.objectContaining({ collection: first.fqcn }),
  );
});

it('searches all providers despite an artifact URL scope and preserves each item provider', async () => {
  api.searchContentItems.mockResolvedValueOnce({
    totalItems: 2,
    items: ['one', 'two'].map((digest, index) => ({
      fqcn: `${first.fqcn}.module${index}`,
      name: `module${index}`,
      collection: first.fqcn,
      collectionVersion: first.version,
      type: 'module',
      in: `r/ee@sha256:${digest}`,
    })),
  });
  await mount('/ns/name_with.dots?tab=content&in=r%2Fee%40sha256%3Aone');
  for (const [index, digest] of ['one', 'two'].entries()) {
    const link = await screen.findByRole('link', {
      name: `${first.fqcn}.module${index}`,
    });
    expect(
      new URL(link.getAttribute('href')!, 'http://localhost').searchParams.get(
        'itemIn',
      ),
    ).toBe(`r/ee@sha256:${digest}`);
  }
  expect(api.searchContentItems).toHaveBeenCalledWith({
    collection: first.fqcn,
    in: undefined,
    q: '',
    limit: 500,
  });
});

it('renders shared documentation preserving the providing artifact', async () => {
  await mount(
    '/ns/name_with.dots?item=ns.name_with.dots.module&itemIn=r%2Fee%40sha256%3Atwo',
  );
  expect(
    await screen.findByRole('heading', {
      name: 'ns.name_with.dots.module in r/ee@sha256:two',
    }),
  ).toBeTruthy();
  expect(api.listCollections).not.toHaveBeenCalled();
  expect(api.searchContentItems).not.toHaveBeenCalled();
});

it('shows every version/provider relationship in the environments table', async () => {
  await mount('/ns/name_with.dots?tab=environments');
  expect(await screen.findByRole('grid')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'r/ee@sha256:one' })).toHaveLength(
    2,
  );
  expect(screen.getByRole('link', { name: 'r/ee@sha256:two' })).toBeTruthy();
});
