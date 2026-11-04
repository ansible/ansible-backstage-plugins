import type { Entity } from '@backstage/catalog-model';
import type { ReactElement, ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import { useNativeEntityPage } from '@ansible/portal-extension-host/alpha';
import {
  discoveryApiRef,
  fetchApiRef,
  type FetchApi,
} from '@backstage/core-plugin-api';
import { DefinitionFileDetailsPage } from './DefinitionFileDetailsPage';
import { EERoutesPage } from './EERoutesPage';
import { notificationStore } from '@ansible/portal-plugin-sdk';

jest.mock('@ansible/portal-extension-host/alpha', () => ({
  useNativeEntityPage: jest.fn(() => undefined),
}));

// Permission policy and the code snippet's clipboard integration are tested separately.
jest.mock('../common/RequiresContentPermission', () => ({
  RequiresContentPermission: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@backstage/core-components', () => ({
  ...jest.requireActual('@backstage/core-components'),
  CodeSnippet: ({ text }: { text: string }) => <pre>{text}</pre>,
}));
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/ee',
}));
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: () => false,
    toggleStarredEntity: jest.fn(),
  }),
}));
jest.mock('./catalog/useEEBuildFlow', () => ({
  useEEBuildFlow: () => ({ authBusy: false, dialogOpen: false }),
}));
jest.mock('./catalog/EEBuildDialog', () => ({ EEBuildDialog: () => null }));
jest.mock('../UnregisterEntityDialog', () => ({
  UnregisterEntityDialog: () => null,
}));
jest.mock('./EECatalogPage', () => ({
  EECatalogPage: () => <div>Catalog route</div>,
}));
jest.mock('./EEDetailsPage', () => ({
  EEDetailsPage: () => <div>Image route</div>,
}));

const mockedUseNativeEntityPage = jest.mocked(useNativeEntityPage);

const validDefinitionYaml = [
  'version: 3',
  'images:',
  '  base_image:',
  '    name: localhost:8445/demo/utopia-ee:latest',
  'dependencies:',
  '  galaxy:',
  '    collections:',
  '      - name: ansible.netcommon',
  '        version: 8.2.0',
  '      - name: ansible.utils',
  '  python:',
  '    - requests>=2.31',
  '    - netaddr',
  '  python_interpreter:',
  '    python_path: /usr/bin/python3.11',
  '  system:',
  '    packages:',
  '      - gcc',
  '      - git',
].join('\n');

beforeAll(() => {
  const cssApi = globalThis.CSS ?? ({} as typeof CSS);
  cssApi.escape ??= value => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: cssApi,
  });
});

beforeEach(() => {
  mockedUseNativeEntityPage.mockReset();
  mockedUseNativeEntityPage.mockReturnValue(undefined);
});

function definitionEntity(): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'team-ee', namespace: 'platform' },
    spec: {
      type: 'execution-environment',
      readme: '# Team automation guide',
      definition: validDefinitionYaml,
    },
  };
}

function renderDetails(
  entity: Entity | undefined,
  localRoute = false,
  fetchImplementation: FetchApi['fetch'] = async () =>
    new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }),
) {
  const getEntityByRef = jest.fn().mockResolvedValue(entity);
  const fetch = jest.fn(fetchImplementation);
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntityByRef }],
        [discoveryApiRef, { getBaseUrl: async () => '/api/catalog' }],
        [fetchApiRef, { fetch }],
      ]}
    >
      <MemoryRouter initialEntries={['/content/ee/catalog/platform/team-ee']}>
        <Routes>
          <Route
            path={
              localRoute
                ? '/content/ee/*'
                : '/content/ee/catalog/:namespace/:name'
            }
            element={
              localRoute ? <EERoutesPage /> : <DefinitionFileDetailsPage />
            }
          />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  return { getEntityByRef, fetch };
}

it('fetches the namespaced Component and renders its inline content through the local details route', async () => {
  const { getEntityByRef, fetch } = renderDetails(definitionEntity(), true);
  expect(
    await screen.findByRole('heading', { name: 'Team automation guide' }),
  ).toBeTruthy();
  expect(getEntityByRef).toHaveBeenCalledWith('component:platform/team-ee');
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText('localhost:8445/demo/utopia-ee:latest')).toBeTruthy();
  expect(screen.getByText('Collections (2)')).toBeTruthy();
  expect(screen.getByText('ansible.netcommon v8.2.0')).toBeTruthy();
  expect(screen.getByText('ansible.utils')).toBeTruthy();
  expect(screen.getByText('Python requirements (2)')).toBeTruthy();
  expect(screen.getByText('requests>=2.31')).toBeTruthy();
  expect(screen.getByText('netaddr')).toBeTruthy();
  expect(screen.getByText('/usr/bin/python3.11')).toBeTruthy();
  expect(screen.getByText('System packages (2)')).toBeTruthy();
  expect(screen.getByText('gcc')).toBeTruthy();
  expect(screen.getByText('git')).toBeTruthy();
  expect(screen.queryByRole('tab')).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Definition files' }).getAttribute('href'),
  ).toBe('/content/ee/catalog');
});

it('shows safe feedback when the details archive cannot be downloaded', async () => {
  notificationStore.clearAll();
  const entity = definitionEntity();
  entity.metadata.annotations = { 'ansible.io/download-experience': 'true' };
  renderDetails(entity);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Download EE files' }),
  );
  expect(
    await screen.findByText(
      'Could not download the execution environment. Please try again.',
    ),
  ).toBeTruthy();
  expect(notificationStore.getNotifications()).toEqual([
    expect.objectContaining({ title: 'Download', severity: 'error' }),
  ]);
  notificationStore.clearAll();
});

it('waits for a refreshed entity before fetching its source files once', async () => {
  const entity = definitionEntity();
  entity.spec = {
    type: 'execution-environment',
    definition: validDefinitionYaml,
  };
  entity.metadata.annotations = {
    'backstage.io/source-location':
      'url:https://github.com/ansible/networking-ee/tree/main',
    'ansible.io/scm-provider': 'github',
  };
  const { getEntityByRef, fetch } = renderDetails(
    entity,
    false,
    async () => new Response('# Source README', { status: 200 }),
  );
  await screen.findByRole('heading', { name: 'Source README' });
  expect(fetch).toHaveBeenCalledTimes(1);
  let resolveEntity!: (value: Entity) => void;
  const refreshedEntity = new Promise<Entity>(resolve => {
    resolveEntity = resolve;
  });
  getEntityByRef.mockImplementationOnce(() => refreshedEntity);
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh definition details' }),
  );
  expect(getEntityByRef).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveEntity({
      ...entity,
      metadata: { ...entity.metadata, description: 'Refreshed entity' },
    });
    await refreshedEntity;
  });
  await screen.findByText('Refreshed entity');
  await screen.findByRole('heading', { name: 'Source README' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('hosts eligible native entity tabs beside the built-in Overview tab', async () => {
  const entity = definitionEntity();
  const nativeSelect = jest.fn();
  const contributedTab = () => <div>Partner details contribution</div>;
  mockedUseNativeEntityPage.mockImplementation(
    (_resolvedEntity, _contentType, onSelect) => ({
      tabs: [
        {
          id: 'partner-details',
          label: 'Partner details',
          component: contributedTab,
        },
      ],
      cards: [],
      actions: [],
      eligibleTabs: [],
      context: {
        entity,
        contentType: CONTENT_TYPES.EXECUTION_ENVIRONMENT_DEFINITION,
      },
      onSelect: id => {
        nativeSelect(id);
        onSelect(0);
      },
    }),
  );

  renderDetails(entity);

  expect(
    await screen.findByRole('heading', { name: 'Team automation guide' }),
  ).toBeTruthy();
  expect(mockedUseNativeEntityPage).toHaveBeenCalledWith(
    entity,
    CONTENT_TYPES.EXECUTION_ENVIRONMENT_DEFINITION,
    expect.any(Function),
  );
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
    'Overview',
    'Partner details',
  ]);

  await userEvent.click(screen.getByRole('tab', { name: 'Partner details' }));
  expect(nativeSelect).toHaveBeenCalledWith('partner-details');
  expect(await screen.findByText('Partner details contribution')).toBeTruthy();

  await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
  expect(
    await screen.findByText('localhost:8445/demo/utopia-ee:latest'),
  ).toBeTruthy();
});

it('renders only the built-in overview when the provider has no eligible tabs', async () => {
  const entity = definitionEntity();
  mockedUseNativeEntityPage.mockReturnValue({
    tabs: [],
    cards: [],
    actions: [],
    eligibleTabs: [],
    context: {
      entity,
      contentType: CONTENT_TYPES.EXECUTION_ENVIRONMENT_DEFINITION,
    },
    onSelect: jest.fn(),
  });

  renderDetails(entity);

  expect(
    await screen.findByRole('heading', { name: 'Team automation guide' }),
  ).toBeTruthy();
  expect(screen.queryByRole('tab')).toBeNull();
});

it('reads absent inline README and definition through the catalog backend route', async () => {
  const entity = definitionEntity();
  entity.spec = { type: 'execution-environment' };
  entity.metadata.annotations = {
    'backstage.io/source-location':
      'url:https://github.com/ansible/networking-ee/tree/main',
    'ansible.io/scm-provider': 'github',
  };
  const getEntityByRef = jest.fn().mockResolvedValue(entity);
  const fetch = jest.fn(
    async (
      input: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(input), 'https://backstage.example');
      const contents = url.searchParams.get('filePath')?.endsWith('README.md')
        ? '# README from source'
        : 'version: 3\nimages:\n  base_image:\n    name: localhost:8445/demo/utopia-ee:latest';
      return new Response(contents, { status: 200 });
    },
  );
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntityByRef }],
        [discoveryApiRef, { getBaseUrl: async () => '/api/catalog' }],
        [fetchApiRef, { fetch }],
      ]}
    >
      <MemoryRouter initialEntries={['/content/ee/catalog/platform/team-ee']}>
        <Routes>
          <Route
            path="/content/ee/catalog/:namespace/:name"
            element={<DefinitionFileDetailsPage />}
          />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );

  expect(await screen.findByText('README from source')).toBeTruthy();
  expect(
    await screen.findByText(/localhost:8445\/demo\/utopia-ee:latest/),
  ).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map(([input]) => String(input)).join('\n')).toContain(
    '/ansible/git/file-content?',
  );
});

it('keeps inline README content when the optional definition fetch is denied', async () => {
  const entity = definitionEntity();
  entity.spec = {
    type: 'execution-environment',
    readme: '# Inline README stays visible',
  };
  entity.metadata.annotations = {
    'backstage.io/source-location':
      'url:https://github.com/ansible/networking-ee/tree/main',
    'ansible.io/scm-provider': 'github',
  };
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      new Response('forbidden', { status: 403 }),
  );

  renderDetails(entity, false, fetch);

  expect(
    await screen.findByRole('heading', { name: 'Inline README stays visible' }),
  ).toBeTruthy();
  expect(
    await screen.findByText(
      'Access to the definition file in the source repository was denied. ' +
        'Check your Ansible content and catalog access, then retry.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps inline definition content when the optional README fetch is denied', async () => {
  const entity = definitionEntity();
  entity.spec = {
    type: 'execution-environment',
    definition: validDefinitionYaml,
  };
  entity.metadata.annotations = {
    'backstage.io/source-location':
      'url:https://github.com/ansible/networking-ee/tree/main',
    'ansible.io/scm-provider': 'github',
  };
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      new Response('forbidden', { status: 403 }),
  );

  renderDetails(entity, false, fetch);

  expect(
    await screen.findByText(
      'Access to the README in the source repository was denied. ' +
        'Check your Ansible content and catalog access, then retry.',
    ),
  ).toBeTruthy();
  expect(screen.getByText('localhost:8445/demo/utopia-ee:latest')).toBeTruthy();
  expect(screen.getByText('Collections (2)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('shows a not-found state for source files that are genuinely absent', async () => {
  const entity = definitionEntity();
  entity.spec = { type: 'execution-environment' };
  entity.metadata.annotations = {
    'backstage.io/source-location':
      'url:https://github.com/ansible/networking-ee/tree/main',
    'ansible.io/scm-provider': 'github',
  };
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      new Response(JSON.stringify({ error: 'missing' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

  renderDetails(entity, false, fetch);

  expect(
    await screen.findByText(
      'The README was not found in the source repository.',
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      'The definition file was not found in the source repository.',
    ),
  ).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2);
});

it.each(['server', 'network'] as const)(
  'offers retry when source files are unavailable (%s)',
  async failure => {
    const entity = definitionEntity();
    entity.spec = { type: 'execution-environment' };
    entity.metadata.annotations = {
      'backstage.io/source-location':
        'url:https://github.com/ansible/networking-ee/tree/main',
      'ansible.io/scm-provider': 'github',
    };
    let recovered = false;
    const fetch = jest.fn(
      async (
        input: RequestInfo | URL,
        _init?: RequestInit,
      ): Promise<Response> => {
        if (!recovered) {
          if (failure === 'network') throw new Error('network down');
          return new Response('upstream error', { status: 500 });
        }
        const url = new URL(String(input), 'https://backstage.example');
        return new Response(
          url.searchParams.get('filePath')?.endsWith('README.md')
            ? '# Recovered source README'
            : validDefinitionYaml,
          { status: 200 },
        );
      },
    );

    renderDetails(entity, false, fetch);

    expect(
      await screen.findAllByText(
        'The source repository is unavailable right now.',
      ),
    ).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2);
    recovered = true;
    await userEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(
      await screen.findByRole('heading', { name: 'Recovered source README' }),
    ).toBeTruthy();
    expect(await screen.findByText('Collections (2)')).toBeTruthy();
    expect(
      screen.getByText('localhost:8445/demo/utopia-ee:latest'),
    ).toBeTruthy();
    expect(
      screen.queryAllByText('The source repository is unavailable right now.'),
    ).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Retry' })).toHaveLength(0);
  },
);

it('keeps inline README visible when the optional definition fetch needs SCM authentication', async () => {
  const entity = definitionEntity();
  entity.spec = {
    type: 'execution-environment',
    readme: '# Inline README remains',
  };
  entity.metadata.annotations = {
    'backstage.io/source-location':
      'url:https://github.com/ansible/networking-ee/tree/main',
    'ansible.io/scm-provider': 'github',
  };
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      new Response(JSON.stringify({ code: 'INTEGRATION_AUTH_FAILED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

  renderDetails(entity, false, fetch);

  expect(
    await screen.findByRole('heading', { name: 'Inline README remains' }),
  ).toBeTruthy();
  expect(
    await screen.findByText(
      'SCM integration authentication failed. Check the configured GitHub ' +
        'or GitLab credentials, then retry.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});

function NextDefinitionRoute(): ReactElement {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate('/content/ee/catalog/platform/next-ee')}>
      Show next definition
    </button>
  );
}

it('does not apply a delayed source response to a different catalog entity', async () => {
  const firstEntity = definitionEntity();
  firstEntity.spec = {
    type: 'execution-environment',
    definition: validDefinitionYaml,
  };
  firstEntity.metadata.annotations = {
    'backstage.io/source-location':
      'url:https://github.com/ansible/networking-ee/tree/main',
    'ansible.io/scm-provider': 'github',
  };
  const nextEntity: Entity = {
    ...definitionEntity(),
    metadata: { name: 'next-ee', namespace: 'platform' },
    spec: {
      type: 'execution-environment',
      readme: '# Next entity inline README',
      definition: validDefinitionYaml,
    },
  };
  let finishFetch: ((response: Response) => void) | undefined;
  const pendingResponse = new Promise<Response>(resolve => {
    finishFetch = resolve;
  });
  const getEntityByRef = jest.fn(async (ref: string) =>
    ref.endsWith('/next-ee') ? nextEntity : firstEntity,
  );
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      pendingResponse,
  );
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntityByRef }],
        [discoveryApiRef, { getBaseUrl: async () => '/api/catalog' }],
        [fetchApiRef, { fetch }],
      ]}
    >
      <MemoryRouter initialEntries={['/content/ee/catalog/platform/team-ee']}>
        <Routes>
          <Route
            path="/content/ee/catalog/:namespace/:name"
            element={<DefinitionFileDetailsPage />}
          />
        </Routes>
        <NextDefinitionRoute />
      </MemoryRouter>
    </TestApiProvider>,
  );

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await userEvent.click(
    screen.getByRole('button', { name: 'Show next definition' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Next entity inline README' }),
  ).toBeTruthy();
  await act(async () => {
    finishFetch?.(
      new Response('# Stale README from previous entity', { status: 200 }),
    );
    await pendingResponse;
    await Promise.resolve();
  });

  expect(
    screen.queryByRole('heading', {
      name: 'Stale README from previous entity',
    }),
  ).toBeNull();
  expect(
    screen.getByRole('heading', { name: 'Next entity inline README' }),
  ).toBeTruthy();
});

it('shows unexpanded file references without implying their contents were read', async () => {
  const entity = definitionEntity();
  entity.spec = {
    type: 'execution-environment',
    definition: [
      'version: 3',
      'images:',
      '  base_image:',
      '    name: localhost:8445/demo/utopia-ee:latest',
      'dependencies:',
      '  galaxy: collections.yml',
      '  python: requirements.txt',
      '  system: bindep.txt',
    ].join('\n'),
  };
  const { fetch } = renderDetails(entity);

  expect(await screen.findByText('From file: collections.yml')).toBeTruthy();
  expect(screen.getByText('From file: requirements.txt')).toBeTruthy();
  expect(screen.getByText('From file: bindep.txt')).toBeTruthy();
  expect(screen.queryByText('Collections (0)')).toBeNull();
  expect(screen.queryByText('No additional collections declared.')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it('does not invent defined content for invalid nonempty YAML', async () => {
  const entity = definitionEntity();
  entity.spec = {
    type: 'execution-environment',
    definition: 'version: [not valid',
  };
  renderDetails(entity);

  expect(
    await screen.findByText('Definition file could not be read.'),
  ).toBeTruthy();
  expect(screen.getByText('Base image').parentElement?.textContent).toContain(
    '—',
  );
  expect(screen.queryByText(/Collections \(/)).toBeNull();
});

it.each([undefined, '', '   '])(
  'reports absent inline content honestly (%p)',
  async content => {
    const entity = definitionEntity();
    entity.spec = {
      type: 'execution-environment',
      readme: content,
      definition: content,
    };
    renderDetails(entity);
    expect(await screen.findByText('No README available.')).toBeTruthy();
    expect(screen.getByText('No definition file available.')).toBeTruthy();
    expect(screen.getByText('No description available.')).toBeTruthy();
    expect(
      screen.queryByText('localhost:8445/demo/utopia-ee:latest'),
    ).toBeNull();
  },
);

it.each([
  ['missing entity', undefined],
  ['wrong kind', { ...definitionEntity(), kind: 'Resource' }],
  ['wrong type', { ...definitionEntity(), spec: { type: 'service' } }],
  [
    'wrong namespace',
    {
      ...definitionEntity(),
      metadata: { name: 'team-ee', namespace: 'other' },
    },
  ],
  [
    'wrong name',
    {
      ...definitionEntity(),
      metadata: { name: 'other', namespace: 'platform' },
    },
  ],
] as const)('shows not found for %s', async (_label, entity) => {
  renderDetails(entity);
  expect(await screen.findByText('Definition file not found')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'README' })).toBeNull();
});

it('rejects registry-backed execution-environment entities as definition files', async () => {
  const registryImage: Entity = {
    ...definitionEntity(),
    metadata: {
      name: 'team-ee',
      namespace: 'platform',
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

  renderDetails(registryImage);

  expect(await screen.findByText('Definition file not found')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'README' })).toBeNull();
  expect(screen.queryByText('localhost:8445/demo/utopia-ee:latest')).toBeNull();
});

it.each([
  ['missing', undefined],
  ['non-HTTP', 'data:text/plain,unsafe'],
  ['credentials', 'https://user:secret@example.com/catalog-info.yaml'],
  ['malformed', 'not a URL'],
])(
  'hides unsafe or unavailable actions for %s metadata',
  async (_label, url) => {
    const entity = definitionEntity();
    entity.metadata.annotations = url
      ? {
          'backstage.io/edit-url': url,
          'backstage.io/source-location': url,
        }
      : {};
    renderDetails(entity);
    const actions = await screen.findByRole('button', { name: 'Actions' });
    expect(
      screen.queryByRole('button', { name: 'Edit definition' }),
    ).toBeNull();
    await userEvent.click(actions);
    expect(
      await screen.findByRole('menuitem', { name: 'Delete' }),
    ).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Build' })).toBeNull();
    expect(
      screen.queryByRole('menuitem', { name: 'Edit definition' }),
    ).toBeNull();
    expect(
      screen.queryByRole('menuitem', { name: 'View in source' }),
    ).toBeNull();
  },
);

it('exposes edit and source actions for safe HTTP metadata without inventing buildability', async () => {
  const entity = definitionEntity();
  entity.metadata.annotations = {
    'backstage.io/edit-url': 'https://example.com/catalog-info.yaml',
    'backstage.io/source-location': 'url:https://example.com/repository',
  };
  renderDetails(entity);
  await userEvent.click(await screen.findByRole('button', { name: 'Actions' }));
  expect(
    await screen.findByRole('menuitem', { name: 'Edit definition' }),
  ).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'View in source' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'Build' })).toBeNull();
});
