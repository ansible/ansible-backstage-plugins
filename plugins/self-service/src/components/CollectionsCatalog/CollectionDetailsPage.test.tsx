import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { Entity } from '@backstage/catalog-model';
import { CollectionDetailsPage } from './CollectionDetailsPage';

const theme = createTheme();

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-namespace-my-collection',
    description: 'Test collection',
    annotations: {
      'ansible.io/collection-source': 'pah',
      'ansible.io/discovery-source-id': 'src-1',
      'backstage.io/source-url': 'https://example.com/source',
    },
  },
  spec: {
    type: 'ansible-collection',
    collection_full_name: 'my_namespace.my_collection',
    collection_version: '1.0.0',
  } as any,
};

const mockCatalogApi = {
  getEntities: jest.fn(),
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

const renderWithRouter = (collectionName: string) => {
  return render(
    <ThemeProvider theme={theme}>
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MemoryRouter initialEntries={[`/collections/${collectionName}`]}>
          <Routes>
            <Route
              path="/collections/:collectionName"
              element={<CollectionDetailsPage />}
            />
          </Routes>
        </MemoryRouter>
      </TestApiProvider>
    </ThemeProvider>,
  );
};

describe('CollectionDetailsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogApi.getEntities.mockResolvedValue({ items: [mockEntity] });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'src-1',
              lastSyncTime: '2024-06-15T10:00:00Z',
              lastFailedSyncTime: null,
            },
          ],
        },
      }),
    });
  });

  it('shows loading initially', () => {
    mockCatalogApi.getEntities.mockImplementation(() => new Promise(() => {}));

    renderWithRouter('my-namespace-my-collection');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders collection name and description when entity loaded', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getAllByText('my_namespace.my_collection').length,
      ).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Test collection').length).toBeGreaterThan(0);
  });

  it('renders breadcrumbs', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('Collections')).toBeInTheDocument();
    });
    expect(
      screen.getAllByText('my_namespace.my_collection').length,
    ).toBeGreaterThan(0);
  });

  it('renders View Source button when entity has source url', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /View Source/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders EmptyState when entity not found', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

    renderWithRouter('unknown-collection');

    await waitFor(() => {
      expect(screen.getByText('No Collections Found')).toBeInTheDocument();
    });
  });

  it('fetches entity by collection name', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
        filter: [
          {
            'metadata.name': 'my-namespace-my-collection',
            kind: 'Component',
            'spec.type': 'ansible-collection',
          },
        ],
      });
    });
  });

  it('displays PAH HTML readme when entity has collection_readme_html', async () => {
    const entityWithHtmlReadme: Entity = {
      ...mockEntity,
      spec: {
        ...mockEntity.spec,
        collection_readme_html: '<p>PAH readme content</p>',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithHtmlReadme],
    });
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('PAH readme content')).toBeInTheDocument();
    });
  });

  it('calls window.open when View Source is clicked', async () => {
    const openSpy = jest
      .spyOn(globalThis, 'open')
      .mockImplementation(() => null);

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /View Source/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /View Source/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/source',
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('navigates to catalog when breadcrumb Collections is clicked', async () => {
    const { container } = renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('Collections')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Collections'));

    expect(container).toBeInTheDocument();
  });

  it('calls fetchEntity when refresh is triggered from about card', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockCatalogApi.getEntities).toHaveBeenCalledTimes(2);
    });
  });

  it('fetches sync status and sets lastSync when sourceId matches', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [{ sourceId: 'src-1', lastSync: '2024-06-15T12:00:00Z' }],
      }),
    });
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ansible/sync/status'),
      );
    });
  });

  it('entity without sourceId does not call sync status', async () => {
    const entityNoSourceId: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          'ansible.io/collection-source': 'pah',
          'backstage.io/source-url': 'https://example.com/source',
        },
      },
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoSourceId],
    });
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    const syncStatusCalls = mockFetchApi.fetch.mock.calls.filter(
      (c: [string]) => String(c[0]).includes('ansible/sync/status'),
    );
    expect(syncStatusCalls.length).toBe(0);
  });

  it('shows EmptyState and breadcrumbs when getEntities rejects', async () => {
    mockCatalogApi.getEntities.mockRejectedValue(new Error('Catalog error'));

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('No Collections Found')).toBeInTheDocument();
    });
    expect(screen.getByText('Collections')).toBeInTheDocument();
  });

  it('does not show description when entity has no metadata.description', async () => {
    const entityNoDesc: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        description: undefined,
      },
    };
    mockCatalogApi.getEntities.mockResolvedValue({ items: [entityNoDesc] });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getAllByText('my_namespace.my_collection').length,
      ).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Test collection')).not.toBeInTheDocument();
  });

  it('does not show View Source when entity has no source url or source-location', async () => {
    const entityNoSource: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          'ansible.io/collection-source': 'pah',
          'ansible.io/discovery-source-id': 'src-1',
        },
      },
    };
    mockCatalogApi.getEntities.mockResolvedValue({ items: [entityNoSource] });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /View Source/i }),
    ).not.toBeInTheDocument();
  });

  it('uses collectionFullName from metadata.title when spec.collection_full_name missing', async () => {
    const entityWithTitle: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        title: 'Custom Collection Title',
      },
      spec: {
        ...mockEntity.spec,
        collection_full_name: undefined,
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({ items: [entityWithTitle] });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getAllByText('Custom Collection Title').length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('tab change updates selected tab', async () => {
    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    });
    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(overviewTab);
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  });

  it('displays lastSync and lastFailedSync from sync status', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: {
          providers: [
            {
              sourceId: 'src-1',
              lastSyncTime: '2024-06-15T12:00:00Z',
              lastFailedSyncTime: '2024-06-14T10:00:00Z',
            },
          ],
        },
      }),
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ansible/sync/status'),
    );
  });

  it('fetches readme via backend when SCM annotations and blob readme URL are present', async () => {
    const entityWithScmReadme: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-host': 'github.com',
          'ansible.io/scm-organization': 'myorg',
          'ansible.io/scm-repository': 'myrepo',
          'ansible.io/ref': 'main',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_url:
          'https://github.com/myorg/myrepo/blob/main/README.md',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithScmReadme],
    });
    mockFetchApi.fetch.mockImplementation((url: string) => {
      if (url.includes('ansible/sync/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            content: { providers: [{ sourceId: 'src-1', lastSyncTime: null }] },
          }),
        });
      }
      if (url.includes('git_readme_content')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('# Backend readme content'),
        });
      }
      return Promise.resolve({ ok: false });
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('Backend readme content')).toBeInTheDocument();
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /git_readme_content\?.*filePath=README\.md.*ref=main/,
      ),
    );
  });

  it('uses parseReadmeFilePath to extract path after blob for backend readme', async () => {
    const entityWithNestedPath: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-host': 'github.com',
          'ansible.io/scm-organization': 'org',
          'ansible.io/scm-repository': 'repo',
          'ansible.io/ref': 'v1.0',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_url:
          'https://github.com/org/repo/blob/v1.0/docs/README.md',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithNestedPath],
    });
    mockFetchApi.fetch.mockImplementation((url: string) => {
      if (url.includes('ansible/sync/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            content: { providers: [] },
          }),
        });
      }
      if (url.includes('git_readme_content')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('Nested path readme'),
        });
      }
      return Promise.resolve({ ok: false });
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('Nested path readme')).toBeInTheDocument();
    });
    expect(mockFetchApi.fetch).toHaveBeenCalledWith(
      expect.stringContaining('filePath=docs%2FREADME.md'),
    );
  });

  it('sets empty readme when fetchReadmeFromBackend returns not ok', async () => {
    const entityWithScmReadme: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-host': 'github.com',
          'ansible.io/scm-organization': 'o',
          'ansible.io/scm-repository': 'r',
          'ansible.io/ref': 'main',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_url: 'https://github.com/o/r/blob/main/README.md',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithScmReadme],
    });
    mockFetchApi.fetch.mockImplementation((url: string) => {
      if (url.includes('ansible/sync/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: { providers: [] } }),
        });
      }
      if (url.includes('git_readme_content')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: false });
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('git_readme_content'),
      );
    });
  });

  it('sets empty readme when fetchReadmeFromBackend rejects', async () => {
    const entityWithScmReadme: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-host': 'github.com',
          'ansible.io/scm-organization': 'o',
          'ansible.io/scm-repository': 'r',
          'ansible.io/ref': 'main',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_url: 'https://github.com/o/r/blob/main/README.md',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityWithScmReadme],
    });
    mockFetchApi.fetch.mockImplementation((url: string) => {
      if (url.includes('ansible/sync/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: { providers: [] } }),
        });
      }
      if (url.includes('git_readme_content')) {
        return Promise.reject(new Error('Backend error'));
      }
      return Promise.resolve({ ok: false });
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('git_readme_content'),
      );
    });
  });

  it('fetches readme from GitHub raw URL when no backend params', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# GitHub raw readme'),
    });

    const entityGitHubRaw: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_url:
          'https://github.com/org/repo/blob/main/README.md',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityGitHubRaw],
    });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: { providers: [] } }),
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('GitHub raw readme')).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/org/repo/main/README.md',
    );

    globalThis.fetch = originalFetch;
  });

  it('sets empty readme when direct fetch rejects', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const entityDirectFetch: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_url:
          'https://github.com/org/repo/blob/main/README.md',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityDirectFetch],
    });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: { providers: [] } }),
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(screen.queryByText('GitHub raw readme')).not.toBeInTheDocument();

    globalThis.fetch = originalFetch;
  });

  it('fetches readme from GitLab raw URL when no backend params', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# GitLab raw readme'),
    });

    const entityGitLabRaw: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_url:
          'https://gitlab.com/org/repo/-/blob/main/README.md',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityGitLabRaw],
    });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: { providers: [] } }),
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('GitLab raw readme')).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://gitlab.com/org/repo/-/raw/main/README.md',
    );

    globalThis.fetch = originalFetch;
  });

  it('falls back to direct fetch when readme URL has no blob path (parseReadmeFilePath returns empty)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('Direct fetch readme'),
    });

    const entityNoBlobInUrl: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-host': 'github.com',
          'ansible.io/scm-organization': 'o',
          'ansible.io/scm-repository': 'r',
          'ansible.io/ref': 'main',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_url:
          'https://raw.githubusercontent.com/o/r/main/README.md',
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoBlobInUrl],
    });
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: { providers: [] } }),
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('Direct fetch readme')).toBeInTheDocument();
    });
    expect(mockFetchApi.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('git_readme_content'),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/o/r/main/README.md',
    );

    globalThis.fetch = originalFetch;
  });

  it('sets empty readme when no collection_readme_url and not PAH html', async () => {
    const entityNoReadmeUrl: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'ansible.io/collection-source': 'scm',
        },
      },
      spec: {
        ...mockEntity.spec,
        collection_readme_html: undefined,
        collection_readme_url: undefined,
      } as any,
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entityNoReadmeUrl],
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    expect(mockFetchApi.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('git_readme_content'),
    );
  });

  it('View Source opens source-location URL with url: prefix stripped', async () => {
    const openSpy = jest
      .spyOn(globalThis, 'open')
      .mockImplementation(() => null);

    const entitySourceLocation: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          'ansible.io/collection-source': 'scm',
          'backstage.io/source-location': 'url:https://gitlab.com/org/repo',
          'ansible.io/discovery-source-id': 'src-1',
        },
      },
    };
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [entitySourceLocation],
    });

    renderWithRouter('my-namespace-my-collection');

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /View Source/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /View Source/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://gitlab.com/org/repo',
      '_blank',
    );
    openSpy.mockRestore();
  });
});
