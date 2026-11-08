import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import userEvent from '@testing-library/user-event';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { usePermission } from '@backstage/plugin-permission-react';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import {
  automationContentApiRef,
  type ArtifactSyncResult,
  ContentApiError,
  type ArtifactContents,
  type AutomationContentApi,
  type Enumeration,
  type ExecutionEnvironment,
  type RepositoryTagMap,
} from '../../api';
import statusBadgeStyles from '../common/StatusBadge.module.css';
import { EEDetailsPage } from './EEDetailsPage';
import {
  clearControllerIntent,
  CONTROLLER_INTENT_PARAM,
  peekControllerIntent,
} from './controllerDialogIntent';

const mockShowNotification = jest.fn();

jest.mock('@backstage/plugin-permission-react', () => ({
  ...jest.requireActual('@backstage/plugin-permission-react'),
  usePermission: jest.fn(),
}));

const mockUsePermission = jest.mocked(usePermission);

beforeEach(() => {
  mockUsePermission.mockReturnValue({ allowed: true, loading: false });
  // The controller-dialog intent lives in the real window URL, which jsdom
  // shares across tests; never let one test's intent leak into the next.
  window.history.replaceState(null, '', window.location.pathname);
});

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
  reconcile: () => Promise<ArtifactSyncResult>,
) {
  let reconciled = false;
  let latestRef = image.ref;
  const getContents = jest.fn(
    async (_ref: string): Promise<ArtifactContents> =>
      reconciled ? refreshedContents : initialContents,
  );
  const getExecutionEnvironment = jest.fn(
    async (requestedRef: string): Promise<ExecutionEnvironment> => {
      if (requestedRef !== image.ref && requestedRef !== latestRef) {
        throw new ContentApiError(404, 'Not found');
      }
      const inventory = reconciled ? refreshedContents : initialContents;
      return {
        ...image,
        ref: requestedRef,
        contentsKnown: inventory.enumeration.status !== 'unknown',
        enumeration: inventory.enumeration,
        counts: { collections: inventory.collections.length },
        collections: inventory.collections,
      };
    },
  );
  const syncArtifact = jest.fn(async (_ref: string) => {
    const result = await reconcile();
    if (result.status === 'completed') {
      reconciled = true;
      latestRef = result.ref;
    }
    return result;
  });
  const api = {
    getExecutionEnvironment,
    getContents,
    syncArtifact,
  } satisfies Pick<
    AutomationContentApi,
    'getExecutionEnvironment' | 'getContents' | 'syncArtifact'
  >;
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, api],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
      ]}
    >
      <MemoryRouter
        initialEntries={[
          `/content/${encodeURIComponent(image.ref)}?tab=collections`,
        ]}
      >
        <Routes>
          <Route path="/content/:ref" element={<EEDetailsPage />} />
        </Routes>
        <CurrentLocation />
      </MemoryRouter>
    </TestApiProvider>,
  );
  return { getContents, getExecutionEnvironment, syncArtifact };
}

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="current-location">
      {location.pathname}
      {location.search}
    </output>
  );
}

const syncedContents: ArtifactContents = {
  enumeration: { status: 'complete', source: 'build-time-manifest' },
  collections: [
    {
      type: 'collection',
      namespace: 'ansible',
      name: 'posix',
      fqcn: 'ansible.posix',
      version: '2.2.2',
      counts: { plugins: 23 },
    },
  ],
  items: [],
};

it('renders only the empty state when an image has no collections', async () => {
  const emptyContents: ArtifactContents = {
    enumeration: { status: 'complete', source: 'build-time-manifest' },
    collections: [],
    items: [],
  };
  renderSyncDetails(emptyContents, emptyContents, async () => ({
    status: 'completed',
    ref: image.ref,
    tag: 'latest',
    retainedPrevious: false,
  }));

  expect(
    await screen.findByRole('heading', {
      name: 'No collections are included in this execution environment',
    }),
  ).toBeTruthy();
  expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
  expect(
    screen.queryByRole('button', { name: /page size|table page/i }),
  ).toBeNull();
  expect(document.querySelector('select[name="pageSize"]')).toBeNull();
  expect(screen.queryByText(/^Show \d+ results$/)).toBeNull();
});

it('shows the verification warning in the details overview', async () => {
  const staleImage: ExecutionEnvironment = {
    ...image,
    lastReconciledAt: new Date(
      Date.now() - 7 * 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    lastReconcileOk: true,
  };
  render(
    <TestApiProvider
      apis={[
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => staleImage,
            getContents: async () => syncedContents,
          },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/content/${encodeURIComponent(image.ref)}`]}
      >
        <Routes>
          <Route path="/content/:ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(
    await screen.findByRole('note', {
      name: 'Last verified over 6 months ago',
    }),
  ).toBeTruthy();
});

it.each([
  ['denied', { allowed: false, loading: false }],
  ['loading', { allowed: false, loading: true }],
] as const)(
  'hides the details Sync action and makes no API call while permission is %s',
  async (_state, permission) => {
    mockUsePermission.mockReturnValue(permission);
    const { syncArtifact } = renderSyncDetails(
      {
        enumeration: { status: 'unknown', source: 'external-introspection' },
        collections: [],
        items: [],
      },
      syncedContents,
      async () => ({
        status: 'completed',
        ref: image.ref,
        tag: 'latest',
        retainedPrevious: false,
      }),
    );
    await screen.findByRole('heading', { name: 'repo' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for repo' }),
    );
    expect(screen.queryByRole('menuitem', { name: 'Sync' })).toBeNull();
    expect(syncArtifact).not.toHaveBeenCalled();
    expect(mockUsePermission).toHaveBeenCalledWith({
      permission: automationContentSyncPermission,
    });
  },
);

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
        ref: image.ref,
        tag: 'latest',
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
    await waitFor(() =>
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Sync completed.',
          severity: 'success',
        }),
      ),
    );
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sync started', severity: 'info' }),
    );
    expect(await screen.findByText('2.2.2')).toBeTruthy();
    expect(screen.getByText('ansible.posix')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'ansible.posix' })).toBeNull();
    await waitFor(() => {
      expect(api.getContents).toHaveBeenCalledTimes(2);
      expect(api.getExecutionEnvironment).toHaveBeenCalledTimes(2);
    });
    expect(api.getContents).toHaveBeenLastCalledWith(image.ref);
    expect(api.syncArtifact).toHaveBeenCalledWith(image.ref);
    expect(screen.queryByText('1.0.0')).toBeNull();
  },
);

it('stays on the current tab when sync changes the artifact digest', async () => {
  const latestRef = 'registry/repo@sha256:two';
  const api = renderSyncDetails(syncedContents, syncedContents, async () => ({
    status: 'completed',
    ref: latestRef,
    tag: 'latest',
    retainedPrevious: false,
  }));
  await screen.findByText('ansible.posix');
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));

  await waitFor(() =>
    expect(screen.getByTestId('current-location').textContent).toBe(
      `/content/${encodeURIComponent(latestRef)}?tab=collections`,
    ),
  );
  expect(
    screen
      .getByRole('tab', { name: 'All Content' })
      .getAttribute('aria-selected'),
  ).toBe('true');
  expect(api.syncArtifact).toHaveBeenCalledWith(image.ref);
  await waitFor(() =>
    expect(api.getExecutionEnvironment).toHaveBeenLastCalledWith(latestRef),
  );
});

it('keeps the current detail after a failed latest image sync without exposing backend errors', async () => {
  const api = renderSyncDetails(syncedContents, syncedContents, async () => ({
    status: 'failed',
    ref: image.ref,
    tag: 'latest',
    retainedPrevious: true,
    error: 'https://user:secret@registry.invalid',
  }));
  await screen.findByText('ansible.posix');
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
  await waitFor(() =>
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Sync failed. Previously indexed content is still shown.',
        severity: 'error',
      }),
    ),
  );
  expect(mockShowNotification).not.toHaveBeenCalledWith(
    expect.objectContaining({ severity: 'success' }),
  );
  expect(api.getContents).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('current-location').textContent).toBe(
    `/content/${encodeURIComponent(image.ref)}?tab=collections`,
  );
  expect(await screen.findByText('ansible.posix')).toBeTruthy();
  expect(screen.queryByText(/secret/)).toBeNull();
});

it.each([
  [403, 'Sync access needed for this image.'],
  [404, 'Latest image not found. This repository may not have a latest tag.'],
  [500, 'Unable to sync this image.'],
] as const)(
  'keeps HTTP %s feedback separate from a completed sync',
  async (status, copy) => {
    const api = renderSyncDetails(syncedContents, syncedContents, async () => {
      throw new ContentApiError(status, 'https://user:secret@registry.invalid');
    });
    await screen.findByText('ansible.posix');
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for repo' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
    await waitFor(() =>
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ description: copy, severity: 'error' }),
      ),
    );
    expect(mockShowNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
    expect(screen.getByTestId('current-location').textContent).toBe(
      `/content/${encodeURIComponent(image.ref)}?tab=collections`,
    );
    expect(api.getContents).toHaveBeenCalledTimes(1);
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
    const getEntities = jest.fn().mockResolvedValue({
      items: [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'pah-published-ansible.posix-1.0.0',
            annotations: {
              'ansible.com/collection': 'ansible.posix',
              'ansible.com/version': '1.0.0',
            },
          },
          spec: { type: 'ansible-collection' },
        },
      ],
    });
    const getContents = jest.fn().mockResolvedValue({
      enumeration,
      collections: [
        {
          type: enumeration.status === 'complete' ? 'collection' : undefined,
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
          [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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
    expect(await screen.findByText('ansible.posix')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen
          .queryByRole('link', { name: 'ansible.posix' })
          ?.getAttribute('href') ?? null,
      ).toBe(
        enumeration.status === 'complete'
          ? '/self-service/collections/pah-published-ansible.posix-1.0.0'
          : null,
      ),
    );
    expect(getContents).toHaveBeenCalledWith(ref);
    expect(
      getEntities.mock.calls.filter(([query]) => Array.isArray(query.filter)),
    ).toEqual(
      enumeration.status === 'complete'
        ? [
            [
              {
                filter: [
                  {
                    kind: 'Component',
                    'spec.type': 'ansible-collection',
                    'metadata.annotations.ansible.com/collection':
                      'ansible.posix',
                  },
                ],
              },
            ],
          ]
        : [],
    );
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'All Content',
    ]);
    expect(screen.queryByRole('tab', { name: 'Content items' })).toBeNull();
    expect(getEntities).toHaveBeenCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/registry': [image.registry],
        'metadata.annotations.ansible.com/repository': [image.repository],
      },
    });
    expect(screen.getByText(expectedContents)).toBeTruthy();
    expect(screen.queryByText(/inventory ·/)).toBeNull();
    expect(
      screen
        .getAllByRole('columnheader')
        .map(header => header.textContent?.trim()),
    ).toEqual([
      'Name',
      'Type',
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
    expect(screen.getAllByText('—')).toHaveLength(
      enumeration.status === 'complete' ? 4 : 5,
    );
    expect(screen.queryByText('collection') !== null).toBe(
      enumeration.status === 'complete',
    );
    expect(screen.queryByText('Certified')).toBeNull();
    expect(screen.queryByText('Signed')).toBeNull();
  },
);

function renderLegacyContentLink(query: string) {
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
          },
        ],
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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
}

it('falls back to Overview for the removed content tab', async () => {
  renderLegacyContentLink('?tab=content');
  expect(
    await screen.findByRole('tab', { name: 'Overview', selected: true }),
  ).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.queryByRole('tab', { name: 'Content items' })).toBeNull();
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
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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
        type: 'collection',
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
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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

  expect(await screen.findByText('ansible.posix')).toBeTruthy();
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
                  type: 'collection',
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
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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

  expect(await screen.findByText('ansible.posix')).toBeTruthy();
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
        type: 'collection',
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
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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

  expect(await screen.findByText('ansible.posix')).toBeTruthy();
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
  const getEntities = jest.fn(
    async ({ filter }: { filter?: { kind?: string } }) =>
      filter?.kind === 'Group'
        ? {
            items: [
              {
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'Group',
                metadata: {
                  name: 'org-default',
                  annotations: {
                    'ansible.com/aap-org-id': '1',
                    'ansible.com/organization': 'Default',
                  },
                },
                spec: { type: 'organization' },
              },
            ],
          }
        : { items: [entity] },
  );
  const scaffold = jest.fn().mockRejectedValue(new Error('template not found'));
  const { rerender } = render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities }],
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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
  expect(screen.getByRole('tab', { name: 'All Content' })).toBeTruthy();
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
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
        [scaffolderApiRef, { scaffold }],
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
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
      'metadata.annotations.ansible.com/registry': [image.registry],
      'metadata.annotations.ansible.com/repository': [image.repository],
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
      organizationId: 1,
      organizationName: 'Default',
      image: image.pullReference,
      pull: 'always',
    },
    secrets: { aapToken: 'aap-token' },
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

jest.mock('@ansible/portal-plugin-sdk', () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
  NotificationStack: () => null,
  useNotifications: () => ({
    showNotification: mockShowNotification,
    notifications: [],
    removeNotification: jest.fn(),
  }),
}));
beforeEach(() => mockShowNotification.mockClear());

describe('controller dialog restore', () => {
  it('reopens the dialog after the login redirect', async () => {
    // The OAuth redirect returns with the intent parked in the URL; the
    // artifact ref is already this page's path.
    window.history.replaceState(
      null,
      '',
      `/?${CONTROLLER_INTENT_PARAM}=${encodeURIComponent(image.ref)}`,
    );
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
          [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
          [scaffolderApiRef, { scaffold: jest.fn() }],
          [
            automationContentApiRef,
            {
              getExecutionEnvironment: async () => image,
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
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(
      screen.getByRole('textbox', { name: 'Execution environment name' }),
    ).toHaveProperty('value', 'repo');
    // The intent is consumed, so a reload cannot reopen it again.
    expect(peekControllerIntent()).toBeNull();
  });

  it('drops the intent when the session cannot be established', async () => {
    window.history.replaceState(
      null,
      '',
      `/?${CONTROLLER_INTENT_PARAM}=${encodeURIComponent(image.ref)}`,
    );
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
          [
            rhAapAuthApiRef,
            { getAccessToken: async () => Promise.reject(new Error('no')) },
          ],
          [scaffolderApiRef, { scaffold: jest.fn() }],
          [
            automationContentApiRef,
            {
              getExecutionEnvironment: async () => image,
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
    // The page renders without a dialog, and the intent is dropped rather
    // than retriggering authentication on every mount.
    expect(await screen.findByText('External registry')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(peekControllerIntent()).toBeNull();
    clearControllerIntent();
  });
});

describe('tag selector', () => {
  const tagMap: RepositoryTagMap = {
    registry: 'registry',
    repository: 'repo',
    tags: [
      { tag: 'latest', digest: 'sha256:one', ref: 'registry/repo@sha256:one' },
      { tag: '2.9', digest: 'sha256:two', ref: 'registry/repo@sha256:two' },
    ],
  };

  function renderWithTagMap(
    artifact: ExecutionEnvironment,
    map: RepositoryTagMap | Error,
    search = '',
  ) {
    const api = {
      getExecutionEnvironment: async (requestedRef: string) =>
        requestedRef === 'registry/repo@sha256:two'
          ? {
              ...artifact,
              ref: requestedRef,
              digest: 'sha256:two',
              tags: ['2.9'],
            }
          : artifact,
      getContents: async () => ({
        enumeration: image.enumeration,
        collections: [],
        items: [],
      }),
      getRepositoryTags:
        map instanceof Error
          ? async () => {
              throw map;
            }
          : async () => map,
    };
    render(
      <TestApiProvider
        apis={[
          [automationContentApiRef, api],
          [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
          [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
        ]}
      >
        <MemoryRouter
          initialEntries={[
            `/content/${encodeURIComponent(artifact.ref)}${search}`,
          ]}
        >
          <Routes>
            <Route path="/content/:ref" element={<EEDetailsPage />} />
          </Routes>
          <CurrentLocation />
        </MemoryRouter>
      </TestApiProvider>,
    );
    return api;
  }

  it('defaults to the latest tag of the current digest', async () => {
    renderWithTagMap({ ...image, tags: ['latest', '3.0'] }, tagMap);
    // The trigger's accessible name carries the "Tags" label; its content
    // shows the selected tag.
    const trigger = await screen.findByRole('button', { name: /tags/i });
    expect(trigger.textContent).toContain('latest');
  });

  it('lists the default tag first, then the rest sorted', async () => {
    renderWithTagMap({ ...image, tags: ['latest'] }, tagMap);
    const trigger = await screen.findByRole('button', { name: /tags/i });
    await userEvent.click(trigger);
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent?.trim())).toEqual([
      'latest (Default)',
      '2.9',
    ]);
  });

  it('falls back to first tag when latest is not on this digest', async () => {
    renderWithTagMap(
      {
        ...image,
        digest: 'sha256:two',
        ref: 'registry/repo@sha256:two',
        tags: ['2.9'],
      },
      tagMap,
    );
    const trigger = await screen.findByRole('button', { name: /2\.9/i });
    expect(trigger.textContent).toContain('2.9');
  });

  it('navigates to the selected tag artifact and keeps the current tab', async () => {
    renderWithTagMap(
      { ...image, tags: ['latest'] },
      tagMap,
      '?tab=collections',
    );
    const trigger = await screen.findByRole('button', { name: /latest/i });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: '2.9' }));
    await waitFor(() =>
      expect(screen.getByTestId('current-location').textContent).toBe(
        `/content/${encodeURIComponent(
          'registry/repo@sha256:two',
        )}?tab=collections`,
      ),
    );
  });

  it('degrades to static badges when the tag map cannot be loaded', async () => {
    renderWithTagMap(
      { ...image, tags: ['latest'] },
      new ContentApiError(500, 'registry down'),
    );
    // Badge fallback, not an error state.
    expect(await screen.findByText('latest')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /latest/i })).toBeNull();
  });
});

it('keeps the previous artifact visible while a tag switch loads', async () => {
  const map: RepositoryTagMap = {
    registry: 'registry',
    repository: 'repo',
    tags: [
      { tag: 'latest', digest: 'sha256:one', ref: 'registry/repo@sha256:one' },
      { tag: '2.9', digest: 'sha256:two', ref: 'registry/repo@sha256:two' },
    ],
  };
  let releaseSecond: ((value: ExecutionEnvironment) => void) | undefined;
  const second = new Promise<ExecutionEnvironment>(resolve => {
    releaseSecond = resolve;
  });
  const api = {
    getExecutionEnvironment: async (requestedRef: string) =>
      requestedRef === 'registry/repo@sha256:two' ? second : image,
    getContents: async () => ({
      enumeration: image.enumeration,
      collections: [],
      items: [],
    }),
    getRepositoryTags: async () => map,
  };
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, api],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
      ]}
    >
      <MemoryRouter
        initialEntries={[`/content/${encodeURIComponent(image.ref)}`]}
      >
        <Routes>
          <Route path="/content/:ref" element={<EEDetailsPage />} />
        </Routes>
        <CurrentLocation />
      </MemoryRouter>
    </TestApiProvider>,
  );
  // First artifact fully loads.
  expect(await screen.findByText('sha256:one')).toBeTruthy();
  const trigger = await screen.findByRole('button', { name: /tags/i });
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name: '2.9' }));
  // While the second digest is still in flight, the page keeps showing the
  // first artifact instead of blanking to the loading skeleton.
  expect(await screen.findByText('sha256:one')).toBeTruthy();
  expect(screen.queryByText('Loading image details…')).toBeNull();
  releaseSecond?.({
    ...image,
    ref: 'registry/repo@sha256:two',
    digest: 'sha256:two',
    tags: ['2.9'],
  });
  expect(await screen.findByText('sha256:two')).toBeTruthy();
});

it('keeps the favorite on the image across tag switches', async () => {
  entityStarred = false;
  // The catalog entity belongs to the default tag's digest; the page is
  // viewing a different digest of the same repository. The star must still
  // represent the image, not the currently displayed version.
  const defaultEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'repo-image',
      annotations: {
        'ansible.com/registry': image.registry,
        'ansible.com/repository': image.repository,
        'ansible.com/digest': 'sha256:one',
      },
    },
  };
  const map: RepositoryTagMap = {
    registry: 'registry',
    repository: 'repo',
    tags: [
      { tag: 'latest', digest: 'sha256:one', ref: 'registry/repo@sha256:one' },
      { tag: '2.9', digest: 'sha256:two', ref: 'registry/repo@sha256:two' },
    ],
  };
  const api = {
    getExecutionEnvironment: async () => ({
      ...image,
      ref: 'registry/repo@sha256:two',
      digest: 'sha256:two',
      tags: ['2.9'],
    }),
    getContents: async () => ({
      enumeration: image.enumeration,
      collections: [],
      items: [],
    }),
    getRepositoryTags: async () => map,
  };
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, api],
        [
          catalogApiRef,
          { getEntities: async () => ({ items: [defaultEntity] }) },
        ],
        [rhAapAuthApiRef, { getAccessToken: async () => 'aap-token' }],
      ]}
    >
      <MemoryRouter
        initialEntries={[
          `/content/${encodeURIComponent('registry/repo@sha256:two')}`,
        ]}
      >
        <Routes>
          <Route path="/content/:ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    await screen.findByRole('button', { name: /add repo-image to favorites/i }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: /remove repo-image from favorites/i }),
  ).toBeNull();
});
