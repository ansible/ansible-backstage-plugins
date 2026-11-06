import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { usePermission } from '@backstage/plugin-permission-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import type { Entity } from '@backstage/catalog-model';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import {
  type ArtifactSyncResult,
  automationContentApiRef,
  ContentApiError,
  type ArtifactContents,
  type AutomationContentApi,
  type ExecutionEnvironment,
} from '../../api';
import { ImagesCatalogPage } from './ImagesCatalogPage';
import statusBadgeStyles from '../common/StatusBadge.module.css';

jest.mock('@backstage/plugin-permission-react', () => ({
  ...jest.requireActual('@backstage/plugin-permission-react'),
  usePermission: jest.fn(),
}));

const mockUsePermission = jest.mocked(usePermission);
const mockIsStarredEntity = jest.fn((_entity: Entity) => false);
const mockToggleStarredEntity = jest.fn();
let entityStarred = false;

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/ee',
}));
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: (entity: Entity) =>
      mockIsStarredEntity(entity) || entityStarred,
    toggleStarredEntity: (entity: Entity) => {
      mockToggleStarredEntity(entity);
      entityStarred = !entityStarred;
    },
  }),
}));

beforeEach(() => {
  mockUsePermission.mockReturnValue({ allowed: true, loading: false });
  mockIsStarredEntity.mockReset().mockReturnValue(false);
  mockToggleStarredEntity.mockReset();
  entityStarred = false;
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

const base: ExecutionEnvironment = {
  ref: 'r/repo@sha256:one',
  registry: 'r',
  repository: 'repo',
  digest: 'sha256:one',
  tags: ['latest'],
  pullReference: 'r/repo@sha256:one',
  contentsKnown: true,
  enumeration: { status: 'partial', source: 'labels' },
  counts: { collections: 2, plugins: 3 },
  collections: [],
};

const linkedEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'automation-team',
    annotations: {
      'ansible.com/registry': 'r',
      'ansible.com/repository': 'repo',
      'ansible.com/digest': 'sha256:one',
    },
  },
};

const envelope = (
  items: ExecutionEnvironment[],
  page = 1,
  totalItems = items.length,
  pageSize = 10,
) => ({
  items,
  page,
  totalItems,
  pageSize,
  next: page * pageSize < totalItems ? `?page=${page + 1}` : null,
});

function createLiveApi(image?: ExecutionEnvironment): {
  api: AutomationContentApi;
  syncArtifact: jest.Mock;
  syncRegistry: jest.Mock;
  syncAll: jest.Mock;
} {
  const enumeration = {
    status: 'unknown' as const,
    source: 'external-introspection' as const,
  };
  const syncArtifact = jest.fn(
    async (_ref: string): Promise<ArtifactSyncResult> => ({
      status: 'completed',
      ref: image?.ref ?? base.ref,
      tag: 'latest',
      retainedPrevious: false,
    }),
  );
  const syncRegistry = jest.fn();
  const syncAll = jest.fn();
  const api: AutomationContentApi = {
    listRegistries: async () => [],
    listExecutionEnvironments: async ({ page = 1 } = {}) => ({
      items: page === 1 && image ? [image] : [],
      page,
      totalItems: image ? 1 : 0,
      next: null,
    }),
    getExecutionEnvironment: async ref => {
      if (image && ref === image.ref) return image;
      throw new ContentApiError(404, 'Not found');
    },
    getContents: async (): Promise<ArtifactContents> => ({
      enumeration,
      collections: [],
      items: [],
    }),
    listCollections: async () => [],
    searchContentItems: async () => ({ items: [], totalItems: 0 }),
    getContentItem: async fqcn => {
      throw new ContentApiError(404, `No content item for ${fqcn}`);
    },
    syncAll,
    syncRegistry,
    syncArtifact,
  };
  return { api, syncArtifact, syncRegistry, syncAll };
}

it('does not describe a failed inventory request as empty', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => {
              throw new Error('offline');
            },
          },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByText('0 images loaded')).toBeNull();
  expect(screen.queryByText('No execution environments discovered')).toBeNull();
});

it('defaults to classified EEs and refetches everything when toggled', async () => {
  const listExecutionEnvironments = jest.fn(async () => envelope([base]));
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, { listExecutionEnvironments }],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.queryByRole('columnheader', { name: 'Digest' })).toBeNull();
  expect(
    screen.queryByRole('columnheader', { name: 'Tags / digest' }),
  ).toBeNull();
  expect(screen.queryByText(base.digest.slice(0, 19))).toBeNull();
  expect(screen.queryByText('latest')).toBeNull();
  expect(screen.queryByText('Untagged')).toBeNull();
  expect(
    screen.getByRole('heading', { name: 'Execution environment images (1)' }),
  ).toBeTruthy();
  expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
    allTypes: false,
    page: 1,
    perPage: 10,
  });
  await userEvent.click(screen.getByRole('checkbox', { name: /all images/ }));
  expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
    allTypes: true,
    page: 1,
    perPage: 10,
  });
});

it('retains search controls when no images match and clears the filters', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([base]) },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Search images' }),
    'absent',
  );
  expect(
    await screen.findByText('No images match your search or filters'),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear search and filters' }),
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Sync|Build|Edit/ })).toBeNull();
});

it('uses server totals, fetches page 2 and resets pagination when all types change', async () => {
  const listExecutionEnvironments = jest.fn(
    async ({ page }: { page: number }) =>
      envelope(
        Array.from({ length: 10 }, (_, index) => ({
          ...base,
          ref: `r/repo@sha256:${page}-${index}`,
          digest: `sha256:${page}-${index}`,
          repository: `repo-${page}-${index}`,
        })),
        page,
        26,
      ),
  );
  const getEntities = jest.fn(async () => ({ items: [] }));
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, { listExecutionEnvironments }],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByText('1 - 10 of 26')).toBeTruthy();
  await waitFor(() =>
    expect(getEntities).toHaveBeenLastCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': Array.from(
          { length: 10 },
          (_, index) => `sha256:1-${index}`,
        ),
      },
    }),
  );
  expect(
    screen.getByRole('button', { name: /Select table page size/ }),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Next table page' }),
  );
  expect(await screen.findByText('11 - 20 of 26')).toBeTruthy();
  expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
    allTypes: false,
    page: 2,
    perPage: 10,
  });
  expect(await screen.findByRole('link', { name: 'repo-2-0' })).toBeTruthy();
  await waitFor(() =>
    expect(getEntities).toHaveBeenLastCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': Array.from(
          { length: 10 },
          (_, index) => `sha256:2-${index}`,
        ),
      },
    }),
  );
  await userEvent.click(screen.getByRole('checkbox', { name: /all images/ }));
  await waitFor(() =>
    expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
      allTypes: true,
      page: 1,
      perPage: 10,
    }),
  );
  expect(await screen.findByText('1 - 10 of 26')).toBeTruthy();
});

it('keeps favorites filtering on the current page', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([base]) },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByText('1 - 1 of 1')).toBeTruthy();
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Favorites only' }),
  );
  expect(
    await screen.findByText('No images match your search or filters'),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear search and filters' }),
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
});

it('offers supported page sizes and resets to page one when the size changes', async () => {
  const listExecutionEnvironments = jest.fn(
    async ({ page, perPage }: { page: number; perPage: number }) =>
      envelope([base], page, 60, perPage),
  );
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, { listExecutionEnvironments }],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByText('1 - 10 of 60');
  await userEvent.click(
    screen.getByRole('button', { name: 'Next table page' }),
  );
  await screen.findByText('11 - 20 of 60');
  const pageSizeSelect = document.querySelector<HTMLSelectElement>(
    'select[name="pageSize"]',
  )!;
  expect(
    Array.from(pageSizeSelect.options)
      .map(option => option.value)
      .filter(Boolean),
  ).toEqual(['10', '20', '50']);
  fireEvent.change(pageSizeSelect, { target: { value: '20' } });
  await waitFor(() =>
    expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
      allTypes: false,
      page: 1,
      perPage: 20,
    }),
  );
  expect(await screen.findByText('1 - 20 of 60')).toBeTruthy();
  expect(screen.getByText('1 images loaded')).toBeTruthy();
});

it('skips the catalog request for an empty page', async () => {
  const getEntities = jest.fn(async () => ({ items: [] }));
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([]) },
        ],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByText('0 images loaded');
  expect(getEntities).not.toHaveBeenCalled();
});

it('keeps inventory visible when the filtered catalog request fails', async () => {
  const getEntities = jest.fn(async () => {
    throw new Error('offline');
  });
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([base]) },
        ],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByText(
    'Catalog links are unavailable. Favorites may be missing.',
  );
  expect(screen.getByRole('link', { name: 'repo' })).toBeTruthy();
});

it('preserves precise matching and favorites for shared digests', async () => {
  mockIsStarredEntity.mockImplementation(
    entity => entity.metadata.name === linkedEntity.metadata.name,
  );
  const other = { ...base, ref: 'r/other@sha256:one', repository: 'other' };
  const getEntities = jest.fn(async () => ({ items: [linkedEntity] }));
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => envelope([base, other]) },
        ],
        [catalogApiRef, { getEntities }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByRole('link', { name: 'repo' });
  await waitFor(() =>
    expect(mockIsStarredEntity).toHaveBeenCalledWith(linkedEntity),
  );
  expect(getEntities).toHaveBeenCalledTimes(1);
  expect(getEntities).toHaveBeenCalledWith({
    filter: {
      kind: 'Component',
      'metadata.annotations.ansible.com/digest': [base.digest],
    },
  });
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Favorites only' }),
  );
  expect(screen.getByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'other' })).toBeNull();
});

it('keeps search and the all-images toggle without the facet rail', async () => {
  const { container } = render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => envelope([base]),
          },
        ],
        [
          catalogApiRef,
          { getEntities: async () => ({ items: [linkedEntity] }) },
        ],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.getByRole('searchbox', { name: 'Search images' })).toBeTruthy();
  expect(
    screen.getByRole('checkbox', { name: 'Show all images' }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Filter by/ })).toBeNull();
  expect(container.querySelectorAll('select')).toHaveLength(1);
  expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy();
  expect(screen.getByText('R')).toBeTruthy();
  expect(screen.getByText('External registry')).toBeTruthy();
  expect(screen.getByText('Syncing')).toBeTruthy();
  const syncingBadge = screen.getByText('Syncing').closest('.bui-Badge');
  expect(syncingBadge?.classList.contains(statusBadgeStyles.info)).toBe(true);
  expect(syncingBadge?.classList.contains(statusBadgeStyles.withIcon)).toBe(
    true,
  );
  expect(syncingBadge?.classList.contains(statusBadgeStyles.outline)).toBe(
    true,
  );
  expect(syncingBadge?.getAttribute('data-size')).toBe('small');
  expect(syncingBadge?.querySelector('.bui-BadgeIcon svg')).toBeTruthy();
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
});

it.each([
  ['denied', { allowed: false, loading: false }],
  ['loading', { allowed: false, loading: true }],
] as const)(
  'hides row sync and makes no API call while permission is %s',
  async (_state, permission) => {
    const syncArtifact = jest.fn();
    mockUsePermission.mockReturnValue(permission);
    render(
      <TestApiProvider
        apis={[
          [
            automationContentApiRef,
            {
              listExecutionEnvironments: async () => envelope([base]),
              syncArtifact,
            },
          ],
          [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        ]}
      >
        <MemoryRouter>
          <ImagesCatalogPage />
        </MemoryRouter>
      </TestApiProvider>,
    );
    await screen.findByRole('link', { name: 'repo' });
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

it('allows sync with the content permission without a matching catalog entity', async () => {
  const syncArtifact = jest.fn().mockResolvedValue({
    status: 'completed',
    ref: base.ref,
    tag: 'latest',
    retainedPrevious: false,
  });
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => envelope([base]),
            syncArtifact,
          },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );

  await screen.findByRole('link', { name: 'repo' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  expect(screen.getByRole('menuitem', { name: 'Sync' })).toBeTruthy();
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
  await waitFor(() => expect(syncArtifact).toHaveBeenCalledWith(base.ref));
  expect(mockUsePermission).toHaveBeenCalledWith({
    permission: automationContentSyncPermission,
  });
});

it('shows the star toggle and reviewed row actions, including the unavailable controller action', async () => {
  const scaffold = jest.fn().mockRejectedValue(new Error('template not found'));
  const syncArtifact = jest
    .fn()
    .mockRejectedValue(new ContentApiError(403, 'Forbidden'));
  const { rerender } = render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => envelope([base]),
            syncArtifact,
          },
        ],
        [
          catalogApiRef,
          { getEntities: async () => ({ items: [linkedEntity] }) },
        ],
        [scaffolderApiRef, { scaffold }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );

  const imageLink = await screen.findByRole('link', { name: 'repo' });
  expect(imageLink.getAttribute('href')).toBe(
    '/content/ee/r%2Frepo%40sha256%3Aone',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Add repo to favorites' }),
  );
  expect(mockToggleStarredEntity).toHaveBeenCalledWith(linkedEntity);
  rerender(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => envelope([base]),
            syncArtifact,
          },
        ],
        [
          catalogApiRef,
          { getEntities: async () => ({ items: [linkedEntity] }) },
        ],
        [scaffolderApiRef, { scaffold }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    screen
      .getByRole('button', { name: 'Remove repo from favorites' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
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
  expect(screen.queryByRole('menuitem', { name: 'View details' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: /favorite/i })).toBeNull();

  await userEvent.click(
    screen.getByRole('menuitem', { name: 'Use in Controller' }),
  );
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(
    screen.getByRole('textbox', { name: 'Execution environment name' }),
  ).toHaveProperty('value', 'repo');
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This action is not available yet. The task template was not found.',
  );
  expect(scaffold).toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
  expect(syncArtifact).toHaveBeenCalledWith(base.ref);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Sync access needed for this image.',
  );
});

it('syncs only the selected artifact and refreshes to its new latest digest', async () => {
  const nextImage: ExecutionEnvironment = {
    ...base,
    ref: 'r/repo@sha256:two',
    digest: 'sha256:two',
    pullReference: 'r/repo@sha256:two',
  };
  const otherImage: ExecutionEnvironment = {
    ...base,
    ref: 'other/other@sha256:one',
    registry: 'other',
    repository: 'other',
    pullReference: 'other/other@sha256:one',
  };
  const { api, syncArtifact, syncRegistry, syncAll } = createLiveApi(base);
  const listExecutionEnvironments = jest
    .fn()
    .mockResolvedValueOnce(envelope([base, otherImage]))
    .mockResolvedValueOnce(envelope([nextImage, otherImage]));
  api.listExecutionEnvironments = listExecutionEnvironments;
  syncArtifact.mockResolvedValueOnce({
    status: 'completed',
    ref: nextImage.ref,
    tag: 'latest',
    retainedPrevious: false,
  });
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, api],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByRole('link', { name: 'repo' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
  expect(
    await screen.findByText(
      'Sync completed. The latest image changed and the catalog was refreshed.',
    ),
  ).toBeTruthy();
  await waitFor(() =>
    expect(listExecutionEnvironments).toHaveBeenCalledTimes(2),
  );
  expect(screen.getByRole('link', { name: 'repo' }).getAttribute('href')).toBe(
    '/content/ee/r%2Frepo%40sha256%3Atwo',
  );
  expect(screen.getByRole('link', { name: 'other' }).getAttribute('href')).toBe(
    '/content/ee/other%2Fother%40sha256%3Aone',
  );
  expect(syncArtifact).toHaveBeenCalledTimes(1);
  expect(syncArtifact).toHaveBeenCalledWith(base.ref);
  expect(syncRegistry).not.toHaveBeenCalled();
  expect(syncAll).not.toHaveBeenCalled();
});

it('marks only the syncing artifact row as in flight', async () => {
  const otherImage: ExecutionEnvironment = {
    ...base,
    ref: 'other/other@sha256:one',
    registry: 'other',
    repository: 'other',
    pullReference: 'other/other@sha256:one',
  };
  const { api, syncArtifact } = createLiveApi(base);
  api.listExecutionEnvironments = async () => envelope([base, otherImage]);
  let finishSync!: (result: ArtifactSyncResult) => void;
  syncArtifact.mockReturnValueOnce(
    new Promise<ArtifactSyncResult>(resolve => {
      finishSync = resolve;
    }),
  );
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, api],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );

  await screen.findByRole('link', { name: 'repo' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  expect(
    screen
      .getByRole('menuitem', { name: 'Syncing…' })
      .getAttribute('aria-disabled'),
  ).toBe('true');

  await userEvent.keyboard('{Escape}');
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for other' }),
  );
  expect(
    screen
      .getByRole('menuitem', { name: 'Sync' })
      .getAttribute('aria-disabled'),
  ).not.toBe('true');
  expect(syncArtifact).toHaveBeenCalledTimes(1);
  expect(syncArtifact).toHaveBeenCalledWith(base.ref);

  await act(async () => {
    finishSync({
      status: 'completed',
      ref: base.ref,
      tag: 'latest',
      retainedPrevious: false,
    });
  });
  expect(await screen.findByText('Sync completed.')).toBeTruthy();
});

it('keeps the row on its current digest after a failed latest image sync', async () => {
  const { api, syncArtifact, syncRegistry, syncAll } = createLiveApi(base);
  const listExecutionEnvironments = jest.fn(async () => envelope([base]));
  api.listExecutionEnvironments = listExecutionEnvironments;
  syncArtifact.mockResolvedValueOnce({
    status: 'failed',
    ref: base.ref,
    tag: 'latest',
    retainedPrevious: true,
    error: 'https://user:secret@registry.invalid',
  });
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, api],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  await screen.findByRole('link', { name: 'repo' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for repo' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));

  expect(
    await screen.findByText(
      'Sync failed. Previously indexed content is still shown.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'repo' }).getAttribute('href')).toBe(
    '/content/ee/r%2Frepo%40sha256%3Aone',
  );
  expect(listExecutionEnvironments).toHaveBeenCalledTimes(1);
  expect(syncArtifact).toHaveBeenCalledWith(base.ref);
  expect(syncRegistry).not.toHaveBeenCalled();
  expect(syncAll).not.toHaveBeenCalled();
  expect(screen.queryByText(/secret/)).toBeNull();
});

it.each([
  [404, 'Latest image not found. This repository may not have a latest tag.'],
  [500, 'Unable to sync this image.'],
] as const)(
  'shows fixed feedback for an HTTP %s latest image sync failure',
  async (status, message) => {
    const { api, syncArtifact } = createLiveApi(base);
    syncArtifact.mockRejectedValueOnce(
      new ContentApiError(status, 'https://user:secret@registry.invalid'),
    );
    render(
      <TestApiProvider
        apis={[
          [automationContentApiRef, api],
          [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        ]}
      >
        <MemoryRouter>
          <ImagesCatalogPage />
        </MemoryRouter>
      </TestApiProvider>,
    );
    await screen.findByRole('link', { name: 'repo' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for repo' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(syncArtifact).toHaveBeenCalledWith(base.ref);
  },
);

it('labels partial counts and unknown contents without requiring catalog matches', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () =>
              envelope([
                base,
                {
                  ...base,
                  ref: 'r/repo@sha256:two',
                  digest: 'sha256:two',
                  contentsKnown: false,
                  enumeration: { status: 'unknown', source: 'labels' },
                },
              ]),
          },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <MemoryRouter>
        <ImagesCatalogPage />
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    await screen.findByText('Approximate: 2 collections / 3 plugins'),
  ).toBeTruthy();
  // The fidelity column is gone; the Contents cell alone carries the label.
  expect(screen.getAllByText('Contents unknown')).toHaveLength(1);
  // The enumeration source ('labels') no longer renders with the fidelity
  // column gone; the Contents summary alone carries the nuance.
  expect(screen.queryByRole('button', { name: /to favorites/ })).toBeNull();
  expect(
    screen.getAllByRole('link', { name: 'repo' })[0].getAttribute('href'),
  ).toContain('r%2Frepo%40sha256%3Aone');
});
