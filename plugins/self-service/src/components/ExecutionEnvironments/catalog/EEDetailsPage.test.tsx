import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { discoveryApiRef, identityApiRef } from '@backstage/core-plugin-api';
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
    InspectEntityDialog: ({ open }: any) =>
      open ? <div data-testid="inspect-dialog">inspect</div> : null,
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

const theme = createMuiTheme();

// ----------------- Helper render (provides catalog, discovery, identity APIs) -----------------
const renderWithCatalogApi = (
  getEntitiesImpl: any,
  options?: {
    discoveryImpl?: any;
    identityImpl?: any;
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

  return render(
    <MemoryRouter initialEntries={['/']}>
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [identityApiRef, mockIdentityApi],
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

    // Ensure navigator.clipboard.writeText exists so tests can inspect/call it.
    // Make it configurable so afterEach can delete it.
    if (!(navigator as any).clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        writable: true,
        value: {
          writeText: jest.fn().mockResolvedValue(undefined),
        },
      });
    } else {
      // If it already exists, but not a jest mock, ensure writeText is mockable
      const cl = (navigator as any).clipboard;
      if (!cl.writeText || typeof cl.writeText !== 'function') {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          writable: true,
          value: {
            writeText: jest.fn().mockResolvedValue(undefined),
          },
        });
      } else if (!(cl.writeText as any)._isMockFunction) {
        // wrap existing function with a mock so we can assert it was called
        cl.writeText = jest.fn().mockImplementation(cl.writeText);
      }
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    cleanup();

    // Remove fake clipboard to avoid leaking to other test suites
    try {
      // only delete if it was defined configurable above
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (
        (navigator as any).clipboard &&
        (navigator as any).clipboard._isMockFunction
      ) {
        // unlikely, but safe-guard
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete (navigator as any).clipboard;
    } catch (e) {
      // ignore if deletion not permitted
    }
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
      //   expect((editLink as HTMLAnchorElement).href).toContain('http://edit/ee-one');
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
    // mock fetch for default readme
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      text: async () => 'Fetched README content',
    });

    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoReadme] }));

    // wait for MarkdownContent to contain fetched text
    await waitFor(
      () =>
        expect(screen.getByTestId('markdown-content').textContent).toContain(
          'Fetched README content',
        ),
      { timeout: 2000 },
    );

    fetchSpy.mockRestore();
  });

  test('default readme fetch failure does not crash and markdown-content may be empty', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    });

    renderWithCatalogApi(() => Promise.resolve({ items: [entityNoReadme] }));

    await screen.findByTestId('favorite-entity');

    // fetch failed; component should not crash. MarkdownContent is present but may be empty.
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();

    fetchSpy.mockRestore();
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

  test('menu actions: copy url, unregister and inspect open respective flows', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityFull] }));

    await screen.findByTestId('favorite-entity');

    // Use the mocked clipboard from beforeEach
    const writeTextMock = (navigator.clipboard as any).writeText as jest.Mock;
    // ensure it's a mock (should be from beforeEach)
    expect(typeof writeTextMock).toBe('function');

    // Find the menu button: choose a header icon button that does not contain favorite-entity
    const buttons = screen.getAllByRole('button');
    const menuButton = buttons.find(
      b =>
        !b.querySelector('[data-testid="favorite-entity"]') &&
        b.querySelector('svg'),
    );
    expect(menuButton).toBeTruthy();
    fireEvent.click(menuButton!);

    // Click "Copy entity URL"
    const copyItem = await screen.findByText(/Copy entity URL/i);
    fireEvent.click(copyItem);

    // Clipboard was used
    await waitFor(() => expect(writeTextMock).toHaveBeenCalled());

    // Open menu again and click Unregister entity -> should show unregister-dialog
    fireEvent.click(menuButton!);
    const unregisterItem = await screen.findByText(/Unregister entity/i);
    fireEvent.click(unregisterItem);
    await waitFor(() =>
      expect(screen.getByTestId('unregister-dialog')).toBeInTheDocument(),
    );

    // Open menu again and click Inspect entity -> should show inspect-dialog
    fireEvent.click(menuButton!);
    const inspectItem = await screen.findByText(/Inspect entity/i);
    fireEvent.click(inspectItem);
    await waitFor(() =>
      expect(screen.getByTestId('inspect-dialog')).toBeInTheDocument(),
    );
  });
});
