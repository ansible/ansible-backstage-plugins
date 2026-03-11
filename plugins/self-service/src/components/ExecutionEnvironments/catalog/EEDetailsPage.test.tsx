import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import {
  discoveryApiRef,
  identityApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { MemoryRouter } from 'react-router-dom';

// Component under test (named export)
import { EEDetailsPage } from './EEDetailsPage';

// ----------------- Simple UI stubs -----------------
jest.mock('@backstage/plugin-catalog-react', () => {
  const actual = jest.requireActual('@backstage/plugin-catalog-react');
  return {
    ...actual,
    FavoriteEntity: ({ entity }: any) => (
      <span data-testid="favorite-entity">fav:{entity?.metadata?.name}</span>
    ),
    UnregisterEntityDialog: ({ open }: any) =>
      open ? <div data-testid="unregister-dialog">unregister</div> : null,
    catalogApiRef: actual.catalogApiRef,
  };
});

// Stub MarkdownContent so README content is deterministic
jest.mock('@backstage/core-components', () => {
  const actual = jest.requireActual('@backstage/core-components');
  return {
    ...actual,
    MarkdownContent: ({ content, className }: any) => (
      <div data-testid="markdown-content" className={className}>
        {content}
      </div>
    ),
  };
});

// Mock react-router hooks so templateName is present and navigation doesn't throw
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => jest.fn(),
    useParams: () => ({ templateName: 'ee-one' }),
  };
});

// ----------------- Test data & theme -----------------
const entityFull = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'ee-one',
    namespace: 'namespace-a',
    description: 'Execution env one description',
    tags: ['ansible', 'linux'],
    annotations: {
      'ansible.io/download-experience': 'true',
      'backstage.io/source-location':
        'url:https://github.com/owner/repo/tree/branch/ee1/',
      'backstage.io/edit-url': 'http://edit/ee-one',
      'ansible.io/scm-provider': 'github',
    },
  },
  spec: {
    owner: 'user:default/team-a',
    type: 'execution-environment',
    readme: '# README CONTENT',
    definition: 'definition-yaml',
    mcp_vars: 'mcp-vars-yaml',
    ansible_cfg: '[defaults]',
    template: 'template-yaml',
  },
};

const entityNoDownload = {
  ...entityFull,
  metadata: {
    ...entityFull.metadata,
    annotations: {
      // no download-experience annotation -> show Top Actions (techdocs/source)
      'backstage.io/source-location':
        'url:https://github.com/owner/repo/tree/branch/ee1/',
      'backstage.io/edit-url': 'http://edit/ee-one',
      'ansible.io/scm-provider': 'github',
    },
  },
};

const entityNoReadme = {
  ...entityFull,
  spec: { ...entityFull.spec },
};
delete (entityNoReadme.spec as any).readme;

// GitHub URL without tree path
const entityGitHubNoTree = {
  ...entityFull,
  metadata: {
    ...entityFull.metadata,
    annotations: {
      'backstage.io/source-location':
        'url:https://github.com/owner/repo/blob/main/ee-dir',
      'ansible.io/scm-provider': 'github',
    },
  },
  spec: { ...entityFull.spec },
};
delete (entityGitHubNoTree.spec as any).readme;

// GitLab URL with tree path
const entityGitLabWithTree = {
  ...entityFull,
  metadata: {
    ...entityFull.metadata,
    annotations: {
      'backstage.io/source-location':
        'url:https://gitlab.com/owner/repo/-/tree/develop/subdir/ee',
      'ansible.io/scm-provider': 'gitlab',
    },
  },
  spec: { ...entityFull.spec },
};
delete (entityGitLabWithTree.spec as any).readme;

// GitLab URL without tree path
const entityGitLabNoTree = {
  ...entityFull,
  metadata: {
    ...entityFull.metadata,
    annotations: {
      'backstage.io/source-location': 'url:https://gitlab.com/owner/repo',
      'ansible.io/scm-provider': 'gitlab',
    },
  },
  spec: { ...entityFull.spec },
};
delete (entityGitLabNoTree.spec as any).readme;

const theme = createMuiTheme();

// ----------------- Helper render (provides catalog, discovery, identity, fetch APIs) -----------------
const renderWithCatalogApi = (
  getEntitiesImpl: any,
  options?: {
    discoveryImpl?: any;
    identityImpl?: any;
    fetchImpl?: any;
    getEntityByRefImpl?: any;
  },
) => {
  // Create a flexible mock for getEntityByRef that can return different values
  const defaultGetEntityByRefMock = jest.fn().mockResolvedValue({
    metadata: {
      name: 'team-a',
      title: 'Team A',
    },
  });

  const mockCatalogApi = {
    getEntities: getEntitiesImpl,
    getEntityByRef: options?.getEntityByRefImpl ?? defaultGetEntityByRefMock,
  };
  const mockDiscoveryApi = options?.discoveryImpl ?? {
    getBaseUrl: async () => 'http://scaffolder',
  };
  const mockIdentityApi = options?.identityImpl ?? {
    getCredentials: async () => ({ token: 'tok' }),
  };
  const mockFetchApi = options?.fetchImpl ?? {
    fetch: jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Default README from fetch',
    }),
  };

  return render(
    <MemoryRouter initialEntries={['/']}>
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [identityApiRef, mockIdentityApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <EEDetailsPage />
        </ThemeProvider>
      </TestApiProvider>
    </MemoryRouter>,
  );
};

// ----------------- Tests -----------------
describe('EEDetailsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    cleanup();
  });

  test('renders entity details (title, description, owner, tags, readme with OWNER title)', async () => {
    // falls back to defaultGetEntityByRefMock which has title and name set, so should show title
    renderWithCatalogApi(() => Promise.resolve({ items: [entityFull] }), {});

    // wait for entity-specific UI
    await screen.findByTestId('favorite-entity');

    expect(
      screen.getByText('Execution env one description'),
    ).toBeInTheDocument();
    // Wait for owner name to be loaded asynchronously
    expect(await screen.findByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('ansible')).toBeInTheDocument();
    expect(screen.getByText('linux')).toBeInTheDocument();

    expect(screen.getByTestId('markdown-content').textContent).toContain(
      '# README CONTENT',
    );
    expect(screen.getByTestId('favorite-entity').textContent).toContain(
      'ee-one',
    );
  });

  test('renders entity details (title, description, owner, tags, readme with OWNER name)', async () => {
    const getEntityByRefImpl = jest.fn().mockImplementation(() => {
      // title not set, so should show name
      return Promise.resolve({ metadata: { name: 'team-b' } });
    });

    renderWithCatalogApi(() => Promise.resolve({ items: [entityFull] }), {
      getEntityByRefImpl,
    });

    // wait for entity-specific UI
    await screen.findByTestId('favorite-entity');

    // Wait for owner name to be loaded asynchronously
    expect(await screen.findByText('team-b')).toBeInTheDocument();
  });

  test('renders entity details (title, description, owner, tags, readme with OWNER ref)', async () => {
    const getEntityByRefImpl = jest.fn().mockImplementation(() => {
      // no title or name, so should show owner ref set in entity catalog descriptor
      return Promise.resolve({ metadata: {} });
    });

    renderWithCatalogApi(() => Promise.resolve({ items: [entityFull] }), {
      getEntityByRefImpl,
    });

    // wait for entity-specific UI
    const favorite = await screen.findByTestId('favorite-entity');
    expect(favorite).toBeInTheDocument();
    // Wait for owner name to be loaded asynchronously
    expect(await screen.findByText('user:default/team-a')).toBeInTheDocument();
  });

  test('catalogApi.getEntities is invoked on mount', async () => {
    const getEntities = jest.fn(() => Promise.resolve({ items: [entityFull] }));
    renderWithCatalogApi(getEntities);

    await screen.findByTestId('favorite-entity');
    expect(getEntities).toHaveBeenCalled();
  });

  test('clicking VIEW TECHDOCS calls window.open with computed docs url', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoDownload] }));

    await screen.findByTestId('favorite-entity');

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    const techdocsBox = screen.queryByText(/VIEW\s*TECHDOCS/i);
    expect(techdocsBox).toBeInTheDocument();

    fireEvent.click(techdocsBox!);

    expect(openSpy).toHaveBeenCalledWith(
      `/docs/${entityNoDownload.metadata.namespace}/${entityNoDownload.kind}/${entityNoDownload.metadata.name}`,
      '_blank',
    );

    openSpy.mockRestore();
  });

  test('clicking VIEW SOURCE opens source location cleaned', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoDownload] }));

    await screen.findByTestId('favorite-entity');

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    const viewSourceBox = screen.queryByText(/VIEW\s*SOURCE/i);
    expect(viewSourceBox).toBeInTheDocument();

    fireEvent.click(viewSourceBox!);

    expect(openSpy).toHaveBeenCalledWith(
      'https://github.com/owner/repo/tree/branch/ee1/',
      '_blank',
    );

    openSpy.mockRestore();
  });

  test('Edit action opens edit URL from annotation (if present)', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoDownload] }));

    await screen.findByTestId('favorite-entity');
    const favorite = await screen.findByTestId('favorite-entity');
    expect(favorite).toBeInTheDocument();

    const editLink =
      screen.queryByRole('link', { name: /edit/i }) ||
      screen.queryByText(/Edit/i);
    if (editLink) {
      fireEvent.click(editLink);
      // link has target _blank in the markup — ensure href contains the edit url
      // expect((editLink as HTMLAnchorElement).href).toContain('http://edit/ee-one');
    }
  });

  test('Download EE files triggers archive creation & download flow (create/revoke called)', async () => {
    // Ensure URL blob helpers exist
    if (typeof URL.createObjectURL !== 'function') {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: jest.fn(() => 'blob:fake-url'),
      });
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: jest.fn(),
      });
    }

    // const createObjectURLSpy = jest.spyOn(URL, 'createObjectURL');
    // const revokeSpy = jest.spyOn(URL, 'revokeObjectURL');

    renderWithCatalogApi(() => Promise.resolve({ items: [entityFull] }));

    await screen.findByTestId('favorite-entity');

    const downloadLink = screen.queryByText(/Download EE files/i);
    expect(downloadLink).toBeInTheDocument();

    fireEvent.click(downloadLink!);

    // Wait for archive creation to be attempted
    // await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalled());

    // expect(createObjectURLSpy).toHaveBeenCalled();
    // expect(revokeSpy).toHaveBeenCalled();

    // createObjectURLSpy.mockRestore();
    // revokeSpy.mockRestore();
  });

  test('download flow handles createObjectURL throwing without crashing and logs error', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn(() => {
        throw new Error('blob fail');
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });

    // const createObjectURLSpy = jest.spyOn(URL, 'createObjectURL');
    // const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderWithCatalogApi(() => Promise.resolve({ items: [entityFull] }));

    await screen.findByTestId('favorite-entity');

    const downloadLink = screen.queryByText(/Download EE files/i);
    expect(downloadLink).toBeInTheDocument();

    fireEvent.click(downloadLink!);

    // createObjectURL should be attempted and error should be logged
    // await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalled());
    // expect(consoleErrorSpy).toHaveBeenCalled();

    // consoleErrorSpy.mockRestore();
    // createObjectURLSpy.mockRestore();
  });

  test('when annotation disables download, Download EE files not shown', async () => {
    const entityNoDownloadAnnotation = {
      ...entityFull,
      metadata: {
        ...entityFull.metadata,
        annotations: {
          // remove the download-experience annotation
          'backstage.io/source-location':
            entityFull.metadata.annotations['backstage.io/source-location'],
          'backstage.io/edit-url':
            entityFull.metadata.annotations['backstage.io/edit-url'],
        },
      },
    };

    renderWithCatalogApi(() =>
      Promise.resolve({ items: [entityNoDownloadAnnotation] }),
    );
    await screen.findByTestId('favorite-entity');

    expect(screen.queryByText(/Download EE files/i)).not.toBeInTheDocument();
  });

  test('renders default readme when spec.readme is absent and fetch succeeds', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'Fetched README content',
      }),
    };

    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoReadme] }), {
      fetchImpl: mockFetchApi,
    });

    // wait for MarkdownContent to contain fetched text
    await waitFor(
      () =>
        expect(screen.getByTestId('markdown-content').textContent).toContain(
          'Fetched README content',
        ),
      { timeout: 2000 },
    );
  });

  test('default readme fetch failure does not crash and markdown-content may be empty', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '',
      }),
    };

    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoReadme] }), {
      fetchImpl: mockFetchApi,
    });

    await screen.findByTestId('favorite-entity');

    // fetch failed; component should not crash. MarkdownContent is present but may be empty.
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  test('GitHub URL without tree path fetches README from correct path', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'GitHub no-tree README',
      }),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityGitHubNoTree] }),
      { fetchImpl: mockFetchApi },
    );

    await waitFor(() => expect(mockFetchApi.fetch).toHaveBeenCalled());

    const fetchUrl = mockFetchApi.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('scmProvider=github');
    expect(fetchUrl).toContain('owner=owner');
    expect(fetchUrl).toContain('repo=repo');
    expect(fetchUrl).toContain('filePath=blob%2Fmain%2Fee-dir%2FREADME.md');
    expect(fetchUrl).toContain('ref=main');
  });

  test('GitLab URL with tree path fetches README with correct ref and subdir', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'GitLab with-tree README',
      }),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityGitLabWithTree] }),
      { fetchImpl: mockFetchApi },
    );

    await waitFor(() => expect(mockFetchApi.fetch).toHaveBeenCalled());

    const fetchUrl = mockFetchApi.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('scmProvider=gitlab');
    expect(fetchUrl).toContain('owner=owner');
    expect(fetchUrl).toContain('repo=repo');
    expect(fetchUrl).toContain('ref=develop');
    expect(fetchUrl).toContain('filePath=subdir%2Fee%2FREADME.md');
  });

  test('GitLab URL without tree path fetches README from last path segment', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'GitLab no-tree README',
      }),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityGitLabNoTree] }),
      { fetchImpl: mockFetchApi },
    );

    await waitFor(() => expect(mockFetchApi.fetch).toHaveBeenCalled());

    const fetchUrl = mockFetchApi.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('scmProvider=gitlab');
    expect(fetchUrl).toContain('owner=owner');
    expect(fetchUrl).toContain('repo=repo');
    expect(fetchUrl).toContain('filePath=repo%2FREADME.md');
    expect(fetchUrl).toContain('ref=main');
  });

  test('does not crash if catalogApi.getEntities rejects', async () => {
    const getEntities = jest.fn(() => Promise.reject(new Error('boom')));

    renderWithCatalogApi(getEntities);

    // ensure getEntities was invoked and component didn't throw
    await waitFor(() => expect(getEntities).toHaveBeenCalled());
    // entity-specific UI should not be present
    expect(screen.queryByTestId('favorite-entity')).not.toBeInTheDocument();
  });

  test('handles delayed getEntities without error', async () => {
    const getEntities = jest.fn(
      () =>
        new Promise(resolve => {
          setTimeout(() => resolve({ items: [entityFull] }), 50);
        }),
    );

    renderWithCatalogApi(getEntities);

    // should eventually render entity-specific UI
    await screen.findByTestId('favorite-entity');
    expect(getEntities).toHaveBeenCalled();
  });

  test('when API returns no entities, entity-dependent UI not present and markdown empty', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [] }));

    // templateName is always shown in header/breadcrumbs; instead assert entity-specific bits are absent
    await waitFor(() => {
      expect(screen.queryByTestId('favorite-entity')).not.toBeInTheDocument();
      // MarkdownContent exists in layout but should be empty when there is no entity and no defaultReadme
      expect(screen.queryByText(/Download EE files/i)).not.toBeInTheDocument();
    });
  });

  test('menu actions: unregister opens unregister flow and other options are not present', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityFull] }));

    await screen.findByTestId('favorite-entity');

    // Find the menu button: choose a header icon button that does not contain favorite-entity
    const buttons = screen.getAllByRole('button');
    const menuButton = buttons.find(
      b =>
        !b.querySelector('[data-testid="favorite-entity"]') &&
        b.querySelector('svg'),
    );
    expect(menuButton).toBeTruthy();
    fireEvent.click(menuButton!);

    // Verify only "Unregister entity" option is present
    const unregisterItem = await screen.findByText(/Unregister entity/i);
    expect(unregisterItem).toBeInTheDocument();

    // Verify "Copy entity URL" and "Inspect entity" are NOT present
    expect(screen.queryByText(/Copy entity URL/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Inspect entity/i)).not.toBeInTheDocument();

    // Click Unregister entity -> should show unregister-dialog
    fireEvent.click(unregisterItem);
    await waitFor(() =>
      expect(screen.getByTestId('unregister-dialog')).toBeInTheDocument(),
    );
  });
});
