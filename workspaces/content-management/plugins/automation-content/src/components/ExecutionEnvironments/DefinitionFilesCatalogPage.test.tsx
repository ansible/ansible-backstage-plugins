import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import yaml from 'js-yaml';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { scmAuthApiRef } from '@backstage/integration-react';
import {
  NotificationProvider,
  notificationStore,
} from '@ansible/portal-plugin-sdk';
import type { Entity } from '@backstage/catalog-model';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { MemoryRouter } from 'react-router-dom';
import styles from './details.module.css';
import { DefinitionFilesCatalogPage } from './DefinitionFilesCatalogPage';

expect.extend(toHaveNoViolations);

it('has no accessibility violations in the loaded definition catalog', async () => {
  const { container } = renderPage();
  await screen.findByRole('link', { name: 'web-ee' });
  expect(await axe(container)).toHaveNoViolations();
});

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef:
    () => (params?: { namespace?: string; kind?: string; name?: string }) =>
      params
        ? `/catalog/${params.namespace}/${params.kind}/${params.name}`
        : '/content/ee',
}));
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    starredEntities: new Set<string>(),
    isStarredEntity: () => false,
    toggleStarredEntity: jest.fn(),
  }),
}));

beforeAll(() => {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { escape: (value: string) => value },
  });
});

const definition: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'web-ee',
    namespace: 'default',
    uid: 'definition-uid',
    title: 'Web execution environment',
    description: 'A definition for web automation.',
    tags: ['linux', 'web'],
  },
  spec: { type: 'execution-environment', owner: 'group:default/platform' },
};

const networkingSeed = yaml.load(
  readFileSync(
    resolve(__dirname, '../../../dev/fixtures/networking-ee.catalog.yaml'),
    'utf8',
  ),
) as Entity;

function hasDigestExclusion(query: unknown): boolean {
  if (typeof query !== 'object' || query === null || !('$not' in query)) {
    return false;
  }
  const notPredicate = query.$not;
  if (
    typeof notPredicate !== 'object' ||
    notPredicate === null ||
    !('metadata.annotations.ansible.com/digest' in notPredicate)
  ) {
    return false;
  }
  const digestPredicate =
    notPredicate['metadata.annotations.ansible.com/digest'];
  return (
    typeof digestPredicate === 'object' &&
    digestPredicate !== null &&
    '$exists' in digestPredicate &&
    digestPredicate.$exists === true
  );
}

function renderPage(
  getEntities: () => Promise<{ items: Entity[] }> = async () => ({
    items: [definition],
  }),
  options: {
    initialEntry?: string;
    getEntityByRef?: () => Promise<Entity | undefined>;
  } = {},
) {
  const queryEntities = jest.fn(
    async (
      request: { query?: unknown; limit?: number; offset?: number } = {},
    ) => {
      const response = await getEntities();
      const filteredItems = hasDigestExclusion(request.query)
        ? response.items.filter(
            entity =>
              entity.metadata.annotations?.['ansible.com/digest'] === undefined,
          )
        : response.items;
      const offset = request.offset ?? 0;
      const limit = request.limit ?? filteredItems.length;
      return {
        items: filteredItems.slice(offset, offset + limit),
        totalItems: filteredItems.length,
        pageInfo: {},
      };
    },
  );
  const view = render(
    <TestApiProvider
      apis={[
        [
          catalogApiRef,
          {
            getEntities,
            queryEntities,
            getEntityByRef: options.getEntityByRef,
            getEntityFacets: async () => ({ facets: {} }),
            getEntitiesByRefs: async () => ({
              items: [
                {
                  apiVersion: 'backstage.io/v1alpha1',
                  kind: 'Group',
                  metadata: { name: 'platform' },
                },
              ],
            }),
            removeEntityByUid: jest.fn(),
          },
        ],
        [scmAuthApiRef, { getCredentials: jest.fn() }],
        [configApiRef, mockApis.config()],
        [discoveryApiRef, mockApis.discovery()],
        [
          fetchApiRef,
          {
            fetch: jest.fn(
              async (
                _input: RequestInfo | URL,
                _init?: RequestInit,
              ): Promise<Response> => new Response('', { status: 404 }),
            ),
          },
        ],
        [identityApiRef, mockApis.identity()],
      ]}
    >
      <MemoryRouter initialEntries={[options.initialEntry ?? '/']}>
        <NotificationProvider>
          <DefinitionFilesCatalogPage />
        </NotificationProvider>
      </MemoryRouter>
    </TestApiProvider>,
  );
  return { ...view, queryEntities };
}

it('renders entity-backed definition columns and metadata', async () => {
  renderPage();
  expect(
    await screen.findByRole('heading', {
      name: 'Execution Environments definition files (1)',
    }),
  ).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeTruthy();
  expect(
    screen.getByRole('columnheader', { name: 'Description' }),
  ).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
  const definitionLink = screen.getByRole('link', { name: 'web-ee' });
  expect(definitionLink.getAttribute('href')).toBe(
    '/content/ee/catalog/default/web-ee',
  );
  expect(definitionLink.className.includes(styles.infoLink)).toBe(true);
  expect(await screen.findByText('platform')).toBeTruthy();
});

it('preserves server full-text matches instead of filtering the paginated rows again', async () => {
  // The catalog can match indexed fields that EntityTextFilter does not inspect.
  const { queryEntities } = renderPage();
  await screen.findByRole('link', { name: 'web-ee' });
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search definition files' }),
    { target: { value: 'server-indexed-term' } },
  );
  await waitFor(() =>
    expect(queryEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fullTextFilter: expect.objectContaining({
          term: 'server-indexed-term',
        }),
        limit: 10,
        offset: 0,
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'web-ee' })).toBeTruthy(),
  );
  expect(
    screen.getByRole('heading', {
      name: 'Execution Environments definition files (1)',
    }),
  ).toBeTruthy();
});

it('encodes non-default definition entity refs in the local details route', async () => {
  const namespacedDefinition: Entity = {
    ...definition,
    metadata: {
      ...definition.metadata,
      name: 'web-ee+staging',
      namespace: 'team+one',
    },
  };
  renderPage(async () => ({ items: [namespacedDefinition] }));

  expect(
    await screen.findByRole('link', { name: 'web-ee+staging' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'web-ee+staging' }).getAttribute('href'),
  ).toBe('/content/ee/catalog/team%2Bone/web-ee%2Bstaging');
});

it('excludes registry-backed images with the catalog provider digest annotation', async () => {
  const registryImage: Entity = {
    ...definition,
    metadata: {
      ...definition.metadata,
      name: 'registry-demo-utopia-ee',
      title: 'demo/utopia-ee:latest',
      description: 'Execution environment with 2 collections',
      tags: ['execution-environment'],
      annotations: {
        'ansible.com/registry': 'demo-registry',
        'ansible.com/repository': 'demo/utopia-ee',
        'ansible.com/digest': 'sha256:0123456789abcdef',
        'ansible.com/pull-reference':
          'registry.example/demo/utopia-ee@sha256:0123456789abcdef',
      },
    },
    spec: {
      type: 'execution-environment',
      lifecycle: 'production',
      owner: 'group:default/platform',
      dependsOn: [],
    },
  };
  const emptyDigestImage: Entity = {
    ...registryImage,
    metadata: {
      ...registryImage.metadata,
      name: 'registry-empty-digest',
      annotations: {
        ...registryImage.metadata.annotations,
        'ansible.com/digest': '',
      },
    },
  };
  const { queryEntities } = renderPage(async () => ({
    items: [definition, networkingSeed, registryImage, emptyDigestImage],
  }));

  expect(
    await screen.findByRole('heading', {
      name: 'Execution Environments definition files (2)',
    }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'web-ee' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'networking-ee' })).toBeTruthy();
  expect(
    screen.queryByRole('link', { name: 'registry-demo-utopia-ee' }),
  ).toBeNull();
  expect(
    screen.queryByRole('link', { name: 'registry-empty-digest' }),
  ).toBeNull();
  expect(queryEntities).toHaveBeenCalledWith(
    expect.objectContaining({
      query: {
        $not: {
          'metadata.annotations.ansible.com/digest': { $exists: true },
        },
      },
    }),
  );
});

it('gates row actions by annotations and buildability', async () => {
  renderPage();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for web-ee' }),
  );
  expect(screen.queryByRole('menuitem', { name: 'Build' })).toBeNull();
  expect(
    screen.queryByRole('menuitem', { name: 'Edit definition' }),
  ).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'View in source' })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
});

it('shows the prototype first-run call to action for an empty catalog', async () => {
  renderPage(async () => ({ items: [] }));
  expect(
    await screen.findByRole('heading', {
      name: 'No Execution Environment definition files, yet',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: 'Create Execution Environment definition file',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', {
      name: 'How to build and use Execution Environment from definition files',
    }),
  ).toBeTruthy();
});

it('keeps the catalog toolbar available and retries an initial query failure safely', async () => {
  const getEntities = jest
    .fn()
    .mockRejectedValueOnce(
      new Error('https://user:secret@catalog.example.test'),
    )
    .mockResolvedValueOnce({ items: [definition] });
  const { queryEntities } = renderPage(getEntities);

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(
    'Unable to load definition files. Try again.',
  );
  expect(alert.textContent).not.toContain('secret');
  expect(alert.textContent).not.toContain('catalog.example.test');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(
    screen.getByRole('searchbox', { name: 'Search definition files' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: /Owner/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Tags/ })).toBeTruthy();
  expect(
    screen.queryByRole('heading', {
      name: 'No Execution Environment definition files, yet',
    }),
  ).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('link', { name: 'web-ee' })).toBeTruthy();
  expect(queryEntities).toHaveBeenCalledTimes(2);
});

it('keeps search and filters mounted after a later query failure and clears stale rows', async () => {
  const getEntities = jest
    .fn()
    .mockResolvedValueOnce({ items: [definition] })
    .mockRejectedValueOnce(new Error('token=private-value'));
  const { queryEntities } = renderPage(getEntities);
  const search = await screen.findByRole('searchbox', {
    name: 'Search definition files',
  });
  search.focus();
  fireEvent.change(search, { target: { value: 'networking' } });

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(
    'Unable to load definition files. Try again.',
  );
  expect(alert.textContent).not.toContain('private-value');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(
    screen.getByRole('searchbox', { name: 'Search definition files' }),
  ).toBe(search);
  expect(document.activeElement).toBe(search);
  expect(screen.getByRole('button', { name: /Owner/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Tags/ })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'web-ee' })).toBeNull();
  expect(queryEntities).toHaveBeenCalledTimes(2);
});

it.each(['0', '-1', '11', '1000000', '20junk', '10.5', 'NaN'])(
  'falls back to the default page size for invalid limit %s',
  async limit => {
    const { queryEntities } = renderPage(undefined, {
      initialEntry: `/?limit=${limit}`,
    });
    await screen.findByRole('link', { name: 'web-ee' });
    expect(queryEntities).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  },
);

it.each([
  {
    outcome: 'missing',
    description:
      'This execution environment is no longer available. Refresh the catalog and try again.',
  },
  {
    outcome: 'invalid archive',
    description:
      'Could not download the execution environment. Please try again.',
  },
  {
    outcome: 'rejected',
    description:
      'Could not download the execution environment. Please try again.',
  },
])(
  'shows safe feedback for a $outcome download lookup',
  async ({ outcome, description }) => {
    notificationStore.clearAll();
    const downloadable: Entity = {
      ...definition,
      metadata: {
        ...definition.metadata,
        annotations: { 'ansible.io/download-experience': 'true' },
      },
    };
    const getEntityByRef = jest.fn(async () => {
      if (outcome === 'rejected') throw new Error('private backend details');
      if (outcome === 'invalid archive') return downloadable;
      return undefined;
    });
    renderPage(async () => ({ items: [downloadable] }), { getEntityByRef });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for web-ee' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Download' }));
    await waitFor(() => {
      expect(notificationStore.getNotifications()).toEqual([
        expect.objectContaining({
          title: 'Download',
          description,
          severity: 'error',
        }),
      ]);
    });
    expect(getEntityByRef).toHaveBeenCalledWith('Component:default/web-ee');
    expect(screen.queryByText(/private backend details/)).toBeNull();
  },
);

it.each([
  ['missing', undefined],
  ['credential-bearing', 'https://user:secret@example.com/catalog-info.yaml'],
  ['non-HTTP', 'ftp://example.com/catalog-info.yaml'],
])('hides source actions for %s catalog URLs', async (_description, url) => {
  const unsafe: Entity = {
    ...definition,
    metadata: {
      ...definition.metadata,
      annotations: {
        ...(url
          ? { 'backstage.io/edit-url': url, 'backstage.io/view-url': url }
          : {}),
      },
    },
  };
  renderPage(async () => ({ items: [unsafe] }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for web-ee' }),
  );
  expect(
    screen.queryByRole('menuitem', { name: 'Edit definition' }),
  ).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'View in source' })).toBeNull();
});

it('shows both source actions for a safe catalog URL', async () => {
  const safe: Entity = {
    ...definition,
    metadata: {
      ...definition.metadata,
      annotations: {
        'backstage.io/edit-url': 'https://example.com/catalog-info.yaml',
      },
    },
  };
  renderPage(async () => ({ items: [safe] }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for web-ee' }),
  );
  expect(
    screen.getByRole('menuitem', { name: 'Edit definition' }),
  ).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'View in source' })).toBeTruthy();
});

it('debounces search and retains the focused search node during reload', async () => {
  let resolveReload: (value: { items: Entity[] }) => void = () => {};
  const getEntities = jest
    .fn()
    .mockResolvedValueOnce({ items: [definition] })
    .mockImplementation(
      () =>
        new Promise<{ items: Entity[] }>(resolveRequest => {
          resolveReload = resolveRequest;
        }),
    );
  const { queryEntities } = renderPage(getEntities);
  const search = await screen.findByRole('searchbox', {
    name: 'Search definition files',
  });
  jest.useFakeTimers();
  try {
    search.focus();
    fireEvent.change(search, { target: { value: 'web' } });
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(queryEntities).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(queryEntities).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('searchbox', { name: 'Search definition files' }),
    ).toBe(search);
    expect(document.activeElement).toBe(search);
    await act(async () => {
      resolveReload({ items: [] });
    });
    expect(
      screen.getByRole('searchbox', { name: 'Search definition files' }),
    ).toBe(search);
    expect(document.activeElement).toBe(search);
  } finally {
    jest.useRealTimers();
  }
  await waitFor(() => expect(queryEntities).toHaveBeenCalledTimes(2));
});
