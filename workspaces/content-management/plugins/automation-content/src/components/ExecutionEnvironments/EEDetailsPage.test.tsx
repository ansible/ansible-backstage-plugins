import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import userEvent from '@testing-library/user-event';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import {
  automationContentApiRef,
  ContentApiError,
  type ArtifactContents,
  type AutomationContentApi,
  type Enumeration,
  type ExecutionEnvironment,
  type RegistrySyncResult,
} from '../../api';
import statusBadgeStyles from '../common/StatusBadge.module.css';
import detailStyles from './details.module.css';
import { EEDetailsPage } from './EEDetailsPage';

const superuserState = { isSuperuser: true };

jest.mock('@ansible/portal-plugin-sdk', () => ({
  ...jest.requireActual('@ansible/portal-plugin-sdk'),
  useIsSuperuser: () => superuserState,
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content',
}));
let entityStarred = false;
const toggleStarredEntity = jest.fn((_entity: unknown) => {
  entityStarred = !entityStarred;
});
beforeAll(() => {
  const cssApi = globalThis.CSS ?? ({} as typeof CSS);
  if (!cssApi.escape) {
    cssApi.escape = value => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: cssApi,
  });
});
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: () => entityStarred,
    toggleStarredEntity: (entity: unknown) => toggleStarredEntity(entity),
  }),
}));

const image: ExecutionEnvironment = {
  ref: 'registry/repo@sha256:one',
  registry: 'registry',
  repository: 'repo',
  digest: 'sha256:one',
  tags: [],
  pullReference: 'registry/repo@sha256:one',
  contentsKnown: true,
  enumeration: { status: 'partial', source: 'labels' },
  collections: [],
};

function renderSyncDetails(
  initialContents: ArtifactContents,
  refreshedContents: ArtifactContents,
  reconcile: () => Promise<RegistrySyncResult>,
) {
  let reconciled = false;
  const getContents = jest.fn(
    async (_ref: string): Promise<ArtifactContents> =>
      reconciled ? refreshedContents : initialContents,
  );
  const getExecutionEnvironment = jest.fn(
    async (_ref: string): Promise<ExecutionEnvironment> => {
      const inventory = reconciled ? refreshedContents : initialContents;
      return {
        ...image,
        contentsKnown: inventory.enumeration.status !== 'unknown',
        enumeration: inventory.enumeration,
        counts: { collections: inventory.collections.length },
        collections: inventory.collections,
      };
    },
  );
  const syncRegistry = jest.fn(async (_registry: string) => {
    const result = await reconcile();
    reconciled = true;
    return result;
  });
  const api = {
    getExecutionEnvironment,
    getContents,
    syncRegistry,
  } satisfies Pick<
    AutomationContentApi,
    'getExecutionEnvironment' | 'getContents' | 'syncRegistry'
  >;
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, api],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(image.ref)}?tab=collections`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  return { getContents, getExecutionEnvironment, syncRegistry };
}

const syncedContents: ArtifactContents = {
  enumeration: { status: 'complete', source: 'build-time-manifest' },
  collections: [
    {
      namespace: 'ansible',
      name: 'posix',
      fqcn: 'ansible.posix',
      version: '2.2.2',
      counts: { plugins: 23 },
    },
  ],
  items: [],
};

it('hides the details Sync action from non-superusers', async () => {
  superuserState.isSuperuser = false;
  try {
    renderSyncDetails(
      {
        enumeration: { status: 'unknown', source: 'external-introspection' },
        collections: [],
        items: [],
      },
      syncedContents,
      async () => ({
        status: 'completed',
        discovered: 0,
        retainedPrevious: false,
      }),
    );
    await screen.findByRole('heading', { name: 'repo' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for repo' }),
    );
    expect(screen.queryByRole('menuitem', { name: 'Sync' })).toBeNull();
  } finally {
    superuserState.isSuperuser = true;
  }
});

it.each(['unknown', 'populated'] as const)(
  'refreshes metadata and collections after syncing an initially %s inventory',
  async initial => {
    const initialContents: ArtifactContents =
      initial === 'unknown'
        ? {
            enumeration: {
              status: 'unknown',
              source: 'external-introspection',
            },
            collections: [],
            items: [],
          }
        : {
            ...syncedContents,
            collections: [
              { ...syncedContents.collections[0], version: '1.0.0' },
            ],
          };
    const api = renderSyncDetails(
      initialContents,
      syncedContents,
      async () => ({
        status: 'completed',
        discovered: 1,
        retainedPrevious: false,
      }),
    );
    await screen.findByRole('heading', { name: 'repo' });
    await waitFor(() => expect(api.getContents).toHaveBeenCalledTimes(1));
    if (initial === 'populated') await screen.findByText('1.0.0');
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for repo' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
    expect(await screen.findByText('Sync completed.')).toBeTruthy();
    expect(await screen.findByText('2.2.2')).toBeTruthy();
    const collectionLink = screen.getByRole('link', { name: 'ansible.posix' });
    expect(collectionLink).toBeTruthy();
    expect(collectionLink.className.includes(detailStyles.infoLink)).toBe(true);
    await waitFor(() => {
      expect(api.getContents).toHaveBeenCalledTimes(2);
      expect(api.getExecutionEnvironment).toHaveBeenCalledTimes(2);
    });
    expect(api.getContents).toHaveBeenLastCalledWith(image.ref);
    expect(api.syncRegistry).toHaveBeenCalledWith(image.registry);
    expect(screen.queryByText('1.0.0')).toBeNull();
  },
);

it('reports a resolved failed sync and refreshes the retained inventory without exposing backend errors', async () => {
  const api = renderSyncDetails(syncedContents, syncedContents, async () => ({
    status: 'failed',
    discovered: 1,
    retainedPrevious: true,
    error: 'https://user:secret@registry.invalid',
  }));
  await screen.findByRole('link', { name: 'ansible.posix' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
  expect(
    await screen.findByText(
      'Sync failed. Previously indexed content is still shown.',
    ),
  ).toBeTruthy();
  await waitFor(() => expect(api.getContents).toHaveBeenCalledTimes(2));
  expect(
    await screen.findByRole('link', { name: 'ansible.posix' }),
  ).toBeTruthy();
  expect(screen.queryByText('Sync started.')).toBeNull();
  expect(screen.queryByText('Sync completed.')).toBeNull();
  expect(screen.queryByText(/secret/)).toBeNull();
});

it.each([
  [403, 'Sync access needed for this registry.'],
  [500, 'Unable to sync this registry.'],
] as const)(
  'keeps HTTP %s feedback separate from a completed sync',
  async (status, copy) => {
    const api = renderSyncDetails(syncedContents, syncedContents, async () => {
      throw new ContentApiError(status, 'https://user:secret@registry.invalid');
    });
    await screen.findByRole('link', { name: 'ansible.posix' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for repo' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(api.getContents).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Sync completed.')).toBeNull();
    expect(screen.queryByText(/secret/)).toBeNull();
  },
);

it.each([
  ['registry/repo@sha256:one', image.enumeration, 'Approximate: 2 plugins'],
  ['registry/repo@sha256:two', image.enumeration, 'Approximate: 2 plugins'],
  [
    'registry/repo@sha256:complete',
    { status: 'complete', source: 'build-time-manifest' } satisfies Enumeration,
    '2 plugins',
  ],
] as const)(
  'keeps collections scoped to %s',
  async (ref, enumeration, expectedContents) => {
    const getEntities = jest.fn().mockResolvedValue({ items: [] });
    const getContents = jest.fn().mockResolvedValue({
      enumeration,
      collections: [
        {
          namespace: 'ansible',
          name: 'posix',
          fqcn: 'ansible.posix',
          version: '1.0.0',
          counts: { plugins: 2 },
        },
      ],
      items: [],
    });
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntities }],
          [
            automationContentApiRef,
            {
              getExecutionEnvironment: async () => ({
                ...image,
                ref,
                enumeration,
              }),
              getContents,
            },
          ],
        ]}
      >
        <MemoryRouter
          initialEntries={[`/${encodeURIComponent(ref)}?tab=collections`]}
        >
          <Routes>
            <Route path=":ref" element={<EEDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </TestApiProvider>,
    );
    const link = await screen.findByRole('link', { name: 'ansible.posix' });
    expect(link.getAttribute('href')).toContain(
      new URLSearchParams({ in: ref, version: '1.0.0' }).toString(),
    );
    expect(getContents).toHaveBeenCalledWith(ref);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Collections',
    ]);
    expect(screen.queryByRole('tab', { name: 'Content items' })).toBeNull();
    expect(getEntities).toHaveBeenCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': [image.digest],
      },
    });
    expect(screen.getByText(expectedContents)).toBeTruthy();
    expect(screen.queryByText(/inventory ·/)).toBeNull();
    expect(
      screen
        .getAllByRole('columnheader')
        .map(header => header.textContent?.trim()),
    ).toEqual([
      'Collection',
      'Version',
      'Status',
      'Publisher',
      'Signing',
      'Source',
      'Contents',
    ]);
    for (const countColumn of [
      'Plugins',
      'Roles',
      'Playbooks',
      'EDA plugins',
      'Rulebooks',
    ]) {
      expect(
        screen.queryByRole('columnheader', { name: countColumn }),
      ).toBeNull();
    }
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('Certified')).toBeNull();
    expect(screen.queryByText('Signed')).toBeNull();
  },
);

function renderLegacyContentLink(query: string) {
  const getContentItem = jest.fn().mockResolvedValue({
    fqcn: 'ansible.posix.mount',
    type: 'module',
    collection: 'ansible.posix',
    collectionVersion: '1.0.0',
    description: ['Retained direct documentation'],
    enumeration: image.enumeration,
    providedBy: [image.ref],
  });
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => image,
            getContents: async () => ({
              enumeration: image.enumeration,
              collections: [],
              items: [],
            }),
            getContentItem,
          },
        ],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(image.ref)}${query}`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  return getContentItem;
}

it('falls back to Overview for the removed content tab', async () => {
  const getContentItem = renderLegacyContentLink('?tab=content');
  expect(
    await screen.findByRole('tab', { name: 'Overview', selected: true }),
  ).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.queryByRole('tab', { name: 'Content items' })).toBeNull();
  expect(getContentItem).not.toHaveBeenCalled();
});

it('retains direct documentation links with a Collections back link', async () => {
  const getContentItem = renderLegacyContentLink(
    '?tab=content&item=ansible.posix.mount',
  );
  await screen.findByText('Retained direct documentation');
  expect(getContentItem).toHaveBeenCalledWith('ansible.posix.mount', image.ref);
  expect(
    screen.getByRole('link', { name: 'repo' }).getAttribute('href'),
  ).toContain('?tab=collections');
});

it('shows populated image metadata without leaking missing classification confidence', async () => {
  const pullReference = `registry.example.net/ansible/utopia-ee@sha256:${'a'.repeat(
    64,
  )}`;
  const populatedImage: ExecutionEnvironment = {
    ...image,
    ref: pullReference,
    registry: 'Production registry',
    repository: 'ansible/utopia-ee',
    digest: `sha256:${'a'.repeat(64)}`,
    pullReference,
    type: 'execution-environment',
    classification: {
      type: 'execution-environment',
      confidence: undefined as unknown as string,
      signals: [],
    },
    tags: ['latest', '3.0.1'],
    contentsKnown: true,
    enumeration: {
      status: 'complete',
      source: 'build-time-manifest',
      ansibleCore: '2.16.4',
      extractedAt: '2025-01-05T12:00:00Z',
    },
    counts: { collections: 6, plugins: 457 },
  };
  const { container } = render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => populatedImage,
            getContents: async () => ({
              enumeration: populatedImage.enumeration,
              collections: [],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter initialEntries={[`/${encodeURIComponent(pullReference)}`]}>
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('heading', { name: 'ansible/utopia-ee' }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Images' })).toBeTruthy();
  expect(screen.getByText('Production registry')).toBeTruthy();
  expect(screen.getByText('Build-time manifest')).toBeTruthy();
  expect(screen.getByText('6 collections / 457 plugins')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: /image to favorites/ }),
  ).toBeNull();
  const statusBadge = screen.getByText('Syncing').closest('.bui-Badge');
  expect(statusBadge?.classList.contains(statusBadgeStyles.info)).toBe(true);
  expect(statusBadge?.classList.contains(statusBadgeStyles.withIcon)).toBe(
    true,
  );
  expect(statusBadge?.classList.contains(statusBadgeStyles.outline)).toBe(true);
  expect(statusBadge?.getAttribute('data-size')).toBe('small');
  expect(statusBadge?.querySelector('.bui-BadgeIcon svg')).toBeTruthy();
  const sourceBadge = screen
    .getByText('External registry')
    .closest('.bui-Badge');
  expect(sourceBadge?.classList.contains(statusBadgeStyles.neutral)).toBe(true);
  expect(sourceBadge?.classList.contains(statusBadgeStyles.withIcon)).toBe(
    false,
  );
  expect(sourceBadge?.classList.contains(statusBadgeStyles.outline)).toBe(
    false,
  );
  expect(screen.getByText('Unknown')).toBeTruthy();
  expect(screen.getByText(pullReference)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'networking-ee' })).toBeNull();
  expect(container.querySelectorAll('.bui-Card')).toHaveLength(1);
  expect(screen.queryByText(/undefined/)).toBeNull();
  expect(screen.queryByText(/confidence/i)).toBeNull();
});

it('links to definition details only for an explicit component entity ref', async () => {
  const definitionImage: ExecutionEnvironment = {
    ...image,
    definitionEntityRef: 'component:team+one/networking+ee',
  };
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => definitionImage,
            getContents: async () => ({
              enumeration: definitionImage.enumeration,
              collections: [],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(definitionImage.ref)}`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  const definitionLink = await screen.findByRole('link', {
    name: 'networking+ee',
  });
  expect(definitionLink.getAttribute('href')).toBe(
    '/content/catalog/team%2Bone/networking%2Bee',
  );
  expect(screen.getAllByText('Definition file').length).toBeGreaterThan(0);
});

it('combines only reported collection content counts and marks missing metadata', async () => {
  const enumeration: Enumeration = {
    status: 'complete',
    source: 'build-time-manifest',
  };
  const completeImage: ExecutionEnvironment = {
    ...image,
    contentsKnown: true,
    enumeration,
  };
  const completeContents: ArtifactContents = {
    enumeration,
    collections: [
      {
        namespace: 'ansible',
        name: 'posix',
        fqcn: 'ansible.posix',
        version: '2.0.0',
        counts: { plugins: 48, roles: 5, playbooks: 3 },
      },
    ],
    items: [],
  };
  const getContents = jest.fn(async () => completeContents);
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => completeImage,
            getContents,
          },
        ],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(image.ref)}?tab=collections`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('link', { name: 'ansible.posix' }),
  ).toBeTruthy();
  expect(screen.getByText('48 plugins, 5 roles, 3 playbooks')).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(4);
  expect(screen.queryByText(/0 (plugins|roles|playbooks)/)).toBeNull();
  expect(getContents).toHaveBeenCalledWith(image.ref);
});

it('uses an em dash when a complete inventory reports no content counts', async () => {
  const enumeration: Enumeration = {
    status: 'complete',
    source: 'build-time-manifest',
  };
  const completeImage: ExecutionEnvironment = {
    ...image,
    contentsKnown: true,
    enumeration,
  };
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => completeImage,
            getContents: async () => ({
              enumeration,
              collections: [
                {
                  namespace: 'ansible',
                  name: 'posix',
                  fqcn: 'ansible.posix',
                  version: '2.0.0',
                  counts: {},
                },
              ],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(image.ref)}?tab=collections`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('link', { name: 'ansible.posix' }),
  ).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(5);
  expect(screen.queryByText('Unknown')).toBeNull();
});

it('keeps collection contents unknown when the image inventory is unknown', async () => {
  const enumeration: Enumeration = {
    status: 'unknown',
    source: 'external-introspection',
  };
  const unknownImage: ExecutionEnvironment = {
    ...image,
    contentsKnown: false,
    enumeration,
  };
  const unknownContents: ArtifactContents = {
    enumeration,
    collections: [
      {
        namespace: 'ansible',
        name: 'posix',
        fqcn: 'ansible.posix',
        version: '1.0.0',
        counts: { plugins: 10 },
      },
    ],
    items: [],
  };
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => unknownImage,
            getContents: async () => unknownContents,
          },
        ],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/${encodeURIComponent(image.ref)}?tab=collections`]}
      >
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('link', { name: 'ansible.posix' }),
  ).toBeTruthy();
  expect(screen.getByText('Unknown')).toBeTruthy();
  expect(screen.queryByText('10 plugins')).toBeNull();
});

it('shows artifact overview, themed source and status, and controller actions', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'image',
      annotations: {
        'ansible.com/registry': image.registry,
        'ansible.com/repository': image.repository,
        'ansible.com/digest': image.digest,
      },
    },
  };
  const getEntities = jest.fn().mockResolvedValue({ items: [entity] });
  const scaffold = jest.fn().mockRejectedValue(new Error('template not found'));
  const { rerender } = render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities }],
        [scaffolderApiRef, { scaffold }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => ({
              ...image,
              type: 'execution-environment',
              classification: {
                type: 'execution-environment',
                confidence: 'likely',
                signals: [],
              },
              contentsKnown: false,
              counts: { collections: 0, plugins: 0 },
              tags: ['latest', '1.0'],
            }),
            getContents: async () => ({
              enumeration: image.enumeration,
              collections: [],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter initialEntries={[`/${encodeURIComponent(image.ref)}`]}>
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    await screen.findByRole('tab', { name: 'Overview', selected: true }),
  ).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Collections' })).toBeTruthy();
  expect(screen.getByText('Contents unknown')).toBeTruthy();
  expect(screen.queryByText('0 collections / 0 plugins')).toBeNull();
  expect(screen.getByText('latest')).toBeTruthy();
  expect(screen.getByText('1.0')).toBeTruthy();
  expect(screen.getByText('External registry')).toBeTruthy();
  expect(screen.getByText('Syncing')).toBeTruthy();
  expect(screen.getByText('Registry labels')).toBeTruthy();
  expect(screen.getByText('Execution environment')).toBeTruthy();
  expect(screen.queryByText(/likely/)).toBeNull();
  expect(screen.queryByText('Provenance')).toBeNull();
  const favoriteButton = screen.getByRole('button', {
    name: 'Add image to favorites',
  });
  expect(favoriteButton.getAttribute('aria-pressed')).toBe('false');
  await userEvent.click(favoriteButton);
  expect(toggleStarredEntity).toHaveBeenCalledWith(entity);
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  expect(
    screen.getByRole('menuitem', { name: 'Use in Controller' }),
  ).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Sync' })).toBeTruthy();
  expect(
    screen.queryByRole('menuitem', { name: 'Copy pull reference' }),
  ).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Favorite' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Unfavorite' })).toBeNull();
  await userEvent.keyboard('{Escape}');
  rerender(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities }],
        [scaffolderApiRef, { scaffold }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => ({
              ...image,
              contentsKnown: false,
              counts: { collections: 0, plugins: 0 },
              tags: ['latest', '1.0'],
            }),
            getContents: async () => ({
              enumeration: image.enumeration,
              collections: [],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter initialEntries={[`/${encodeURIComponent(image.ref)}`]}>
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  const unfavoriteButton = screen.getByRole('button', {
    name: 'Remove image from favorites',
  });
  expect(unfavoriteButton.getAttribute('aria-pressed')).toBe('true');
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  expect(screen.queryByRole('menuitem', { name: 'Unfavorite' })).toBeNull();
  await userEvent.keyboard('{Escape}');
  expect(getEntities).toHaveBeenCalledWith({
    filter: {
      kind: 'Component',
      'metadata.annotations.ansible.com/digest': [image.digest],
    },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(
    screen.getByRole('menuitem', { name: 'Use in Controller' }),
  );
  expect(await screen.findByRole('dialog')).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This action is not available yet. The task template was not found.',
  );
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/ee-use-in-controller',
    values: {
      environmentName: 'repo',
      environmentDescription: 'Use repo in Ansible Automation Controller.',
      image: image.pullReference,
      pull: 'always',
      organization: '',
    },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Copy pull reference' }),
  );
  expect(writeText).toHaveBeenCalledWith(image.pullReference);
  expect(await screen.findByText('Pull reference copied')).toBeTruthy();
  expect(
    screen.queryByRole('tab', { name: 'Collections in this image' }),
  ).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Definition file' })).toBeNull();
});
