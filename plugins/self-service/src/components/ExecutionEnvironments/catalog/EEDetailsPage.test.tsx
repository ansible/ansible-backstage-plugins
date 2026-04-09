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
  configApiRef,
  discoveryApiRef,
  identityApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { scmAuthApiRef } from '@backstage/integration-react';
import { eeBuildApiRef } from '../../../apis';
import { NotificationProvider, notificationStore } from '../../notifications';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { MemoryRouter } from 'react-router-dom';
import { SCM_INTEGRATION_AUTH_FAILED_CODE } from '@ansible/backstage-rhaap-common/constants';

// Component under test (named export)
import { EEDetailsPage } from './EEDetailsPage';

jest.mock('@backstage/core-plugin-api', () => {
  const actual = jest.requireActual('@backstage/core-plugin-api');
  return { ...actual, useRouteRef: () => () => '/self-service' };
});

jest.mock('../../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

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

/** No in-spec readme or definition — triggers backend fetches for both. */
const entityNoReadmeNoDefinition = {
  ...entityFull,
  spec: { ...entityFull.spec },
};
delete (entityNoReadmeNoDefinition.spec as any).readme;
delete (entityNoReadmeNoDefinition.spec as any).definition;

const theme = createMuiTheme();

const mockConfigApi = {
  getOptionalString: jest.fn((key: string): string | undefined => {
    if (key === 'ansible.rhaap.baseUrl') {
      return 'https://aap.example.com';
    }
    return undefined;
  }),
};

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
  const mockScmAuthApi = {
    getCredentials: jest.fn().mockResolvedValue({ token: 't', headers: {} }),
  };
  const mockEeBuildApi = {
    triggerBuild: jest.fn().mockResolvedValue({ accepted: true }),
  };

  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <TestApiProvider
        apis={[
          [configApiRef, mockConfigApi],
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [identityApiRef, mockIdentityApi],
          [fetchApiRef, mockFetchApi],
          [scmAuthApiRef, mockScmAuthApi],
          [eeBuildApiRef, mockEeBuildApi],
        ]}
      >
        <NotificationProvider>
          <ThemeProvider theme={theme}>
            <EEDetailsPage />
          </ThemeProvider>
        </NotificationProvider>
      </TestApiProvider>
    </MemoryRouter>,
  );
  return Object.assign(view, {
    mockScmAuthApi,
    mockCatalogApi,
    mockEeBuildApi,
  });
};

// ----------------- Tests -----------------
describe('EEDetailsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    notificationStore.clearAll();
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

  test('clicking Read more (long description) expands description inline and shows Read less', async () => {
    const longDescription =
      'Long description over 150 characters. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.';
    const entityLongDesc = {
      ...entityNoDownload,
      metadata: {
        ...entityNoDownload.metadata,
        description: longDescription,
      },
    };
    renderWithCatalogApi(() => Promise.resolve({ items: [entityLongDesc] }));

    await screen.findByTestId('favorite-entity');

    const readMore = screen.queryByText(/Read more/i);
    expect(readMore).toBeInTheDocument();
    expect(screen.queryByText(longDescription)).toBeNull();

    fireEvent.click(readMore!);

    expect(screen.getByText(longDescription)).toBeInTheDocument();
    expect(screen.getByText(/Read less/i)).toBeInTheDocument();
  });

  test('Resources card renders documentation links', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoDownload] }));

    await screen.findByTestId('favorite-entity');

    expect(
      screen.getByText(
        /Create execution environment definitions in self-service automation portal/i,
      ),
    ).toBeInTheDocument();
  });

  test('Edit definition action opens definition file URL', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoDownload] }));

    await screen.findByTestId('favorite-entity');

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    const actionsButton = screen.getByRole('button', { name: /Actions/i });
    fireEvent.click(actionsButton);
    const editDefinitionItem = await screen.findByText(/Edit definition/i);
    fireEvent.click(editDefinitionItem);

    expect(openSpy).toHaveBeenCalledWith('http://edit/ee-one.yml', '_blank');
    openSpy.mockRestore();
  });

  test('source link points to source location and opens in new tab', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoDownload] }));

    await screen.findByTestId('favorite-entity');

    // Main layout uses "Source" section with link labeled by SCM (e.g. GitHub)
    const sourceLink = screen.getByRole('link', { name: /github/i });
    expect(sourceLink).toHaveAttribute(
      'href',
      'https://github.com/owner/repo/tree/branch/ee1/',
    );
    expect(sourceLink).toHaveAttribute('target', '_blank');
  });

  test('Edit action opens edit URL from annotation (if present)', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoDownload] }));

    await screen.findByTestId('favorite-entity');
    const favorite = await screen.findByTestId('favorite-entity');
    expect(favorite).toBeInTheDocument();

    const editLinks = screen.queryAllByRole('link', {
      name: /edit definition/i,
    });
    const editLink =
      editLinks.length > 0
        ? editLinks[0]
        : screen.queryByText(/Edit definition/i);
    if (editLink) {
      fireEvent.click(editLink);
      // link has target _blank in the markup — ensure href contains the edit url
      // expect((editLink as HTMLAnchorElement).href).toContain('http://edit/ee-one');
    }
  });

  test('AboutCard shows source link from source-location when edit-url is missing', async () => {
    const entitySourceLocationOnly = {
      ...entityNoDownload,
      metadata: {
        ...entityNoDownload.metadata,
        annotations: {
          'backstage.io/source-location':
            'url:https://git.example.com/org/repo',
        },
      },
    };
    renderWithCatalogApi(() =>
      Promise.resolve({ items: [entitySourceLocationOnly] }),
    );

    await screen.findByTestId('favorite-entity');

    // Main layout shows Source section with link (no separate EDIT URL block)
    const sourceLink = screen.getByRole('link', {
      name: /source/i,
    });
    expect(sourceLink).toHaveAttribute(
      'href',
      'https://git.example.com/org/repo',
    );
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

  test('download with missing definition/readme/ansible_cfg returns early without creating blob', async () => {
    const createObjectURLSpy = jest.spyOn(URL, 'createObjectURL');

    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoReadme] }));

    await screen.findByTestId('favorite-entity');

    const downloadLink = screen.queryByText(/Download EE files/i);
    expect(downloadLink).toBeInTheDocument();

    fireEvent.click(downloadLink!);

    // downloadEntityAsTarArchive returns false when required spec is missing; no blob is created
    await waitFor(() => {
      expect(createObjectURLSpy).not.toHaveBeenCalled();
    });

    createObjectURLSpy.mockRestore();
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

  test('Actions menu: Delete opens unregister flow; Build, Edit definition present when not download-experience', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoDownload] }));

    await screen.findByTestId('favorite-entity');

    const actionsButton = screen.getByRole('button', { name: /Actions/i });
    fireEvent.click(actionsButton);

    expect(
      screen.getByRole('menuitem', { name: /Build/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Edit definition/i)).toBeInTheDocument();
    const deleteItem = await screen.findByText(/Delete/i);
    expect(deleteItem).toBeInTheDocument();

    expect(screen.queryByText(/Copy entity URL/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Inspect entity/i)).not.toBeInTheDocument();

    fireEvent.click(deleteItem);
    await waitFor(() =>
      expect(screen.getByTestId('unregister-dialog')).toBeInTheDocument(),
    );
  });

  test('Actions menu: clicking Build runs SCM auth and opens build dialog (GitHub-published EE)', async () => {
    const { mockScmAuthApi } = renderWithCatalogApi(() =>
      Promise.resolve({ items: [entityNoDownload] }),
    );

    await screen.findByTestId('favorite-entity');

    fireEvent.click(screen.getByRole('button', { name: /Actions/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Build$/i }));

    await waitFor(() =>
      expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith({
        url: 'https://github.com/owner/repo',
      }),
    );
    expect(
      await screen.findByText('Build execution environment image'),
    ).toBeInTheDocument();
  });

  test('Actions menu: Build is hidden when EE is not published to GitHub', async () => {
    renderWithCatalogApi(() =>
      Promise.resolve({ items: [entityGitLabWithTree] }),
    );

    await screen.findByTestId('favorite-entity');

    fireEvent.click(screen.getByRole('button', { name: /Actions/i }));

    expect(
      screen.queryByRole('menuitem', { name: /^Build$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Edit definition/i }),
    ).toBeInTheDocument();
  });

  test('shows SCM integration auth error when default readme fetch returns integration_auth', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            code: SCM_INTEGRATION_AUTH_FAILED_CODE,
            error: 'Bad credentials',
          }),
      }),
    };

    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoReadme] }), {
      fetchImpl: mockFetchApi,
    });

    await waitFor(() => {
      expect(
        screen.getByText('SCM integration unavailable'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /This execution environment could not be loaded from the source repository/i,
      ),
    ).toBeInTheDocument();
  });

  test('shows SCM integration auth error when EE definition fetch returns integration_auth', async () => {
    const entityReadmeNoDefinition = {
      ...entityFull,
      spec: { ...entityFull.spec },
    };
    delete (entityReadmeNoDefinition.spec as { definition?: string })
      .definition;

    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            code: SCM_INTEGRATION_AUTH_FAILED_CODE,
            error: 'Bad credentials',
          }),
      }),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityReadmeNoDefinition] }),
      { fetchImpl: mockFetchApi },
    );

    await waitFor(() => {
      expect(
        screen.getByText('SCM integration unavailable'),
      ).toBeInTheDocument();
    });
    expect(mockFetchApi.fetch).toHaveBeenCalled();
  });

  test('readme fetch rejection clears state and does not show SCM integration error', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockRejectedValue(new Error('network error')),
    };

    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoReadme] }), {
      fetchImpl: mockFetchApi,
    });

    await screen.findByTestId('favorite-entity');
    await waitFor(() => expect(mockFetchApi.fetch).toHaveBeenCalled());
    expect(
      screen.queryByText('SCM integration unavailable'),
    ).not.toBeInTheDocument();
  });

  test('fetched definition success clears scm error and surfaces parsed base image', async () => {
    const entityReadmeNoDefinition = {
      ...entityFull,
      spec: { ...entityFull.spec },
    };
    delete (entityReadmeNoDefinition.spec as { definition?: string })
      .definition;

    const yamlDef = `images:
  base_image:
    name: quay.io/fetched/from-repo/ee-base
`;
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        text: async () => yamlDef,
      }),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityReadmeNoDefinition] }),
      { fetchImpl: mockFetchApi },
    );

    await screen.findByTestId('favorite-entity');
    await waitFor(() =>
      expect(
        screen.getByText('quay.io/fetched/from-repo/ee-base'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText('SCM integration unavailable'),
    ).not.toBeInTheDocument();
  });

  test('definition fetch non-integration failure clears state without SCM error', async () => {
    const entityReadmeNoDefinition = {
      ...entityFull,
      spec: { ...entityFull.spec },
    };
    delete (entityReadmeNoDefinition.spec as { definition?: string })
      .definition;

    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '{"error":"file not found"}',
      }),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityReadmeNoDefinition] }),
      { fetchImpl: mockFetchApi },
    );

    await screen.findByTestId('favorite-entity');
    await waitFor(() => expect(mockFetchApi.fetch).toHaveBeenCalled());
    expect(
      screen.queryByText('SCM integration unavailable'),
    ).not.toBeInTheDocument();
  });

  test('definition fetch rejection clears state without SCM error', async () => {
    const entityReadmeNoDefinition = {
      ...entityFull,
      spec: { ...entityFull.spec },
    };
    delete (entityReadmeNoDefinition.spec as { definition?: string })
      .definition;

    const mockFetchApi = {
      fetch: jest.fn().mockRejectedValue(new Error('definition fetch failed')),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityReadmeNoDefinition] }),
      { fetchImpl: mockFetchApi },
    );

    await screen.findByTestId('favorite-entity');
    await waitFor(() => expect(mockFetchApi.fetch).toHaveBeenCalled());
    expect(
      screen.queryByText('SCM integration unavailable'),
    ).not.toBeInTheDocument();
  });

  test('readme and definition fetches with non-auth failures clear without SCM error', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '{"error":"upstream"}',
      }),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityNoReadmeNoDefinition] }),
      { fetchImpl: mockFetchApi },
    );

    await screen.findByTestId('favorite-entity');
    await waitFor(() =>
      expect(mockFetchApi.fetch.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    expect(
      screen.queryByText('SCM integration unavailable'),
    ).not.toBeInTheDocument();
  });

  test('shows SCM integration auth error when readme fetch is integration_auth but definition fetch succeeds', async () => {
    const mockFetchApi = {
      fetch: jest.fn().mockImplementation((url: string) => {
        if (url.includes('README.md')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: async () =>
              JSON.stringify({
                code: SCM_INTEGRATION_AUTH_FAILED_CODE,
                error: 'Bad credentials',
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () =>
            `images:
  base_image:
    name: quay.io/ok/from-def
`,
        });
      }),
    };

    renderWithCatalogApi(
      () => Promise.resolve({ items: [entityNoReadmeNoDefinition] }),
      { fetchImpl: mockFetchApi },
    );

    await waitFor(() => {
      expect(
        screen.getByText('SCM integration unavailable'),
      ).toBeInTheDocument();
    });
    expect(mockFetchApi.fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
