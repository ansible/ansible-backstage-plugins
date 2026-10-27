import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen, waitFor } from '@testing-library/react';
import {
  mockApis,
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { mockCatalogApi } from '../../tests/catalogApi_utils';
import { CatalogItemsDetails } from './CatalogItemDetails';
import { rootRouteRef } from '../../routes';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { createTheme, ThemeProvider } from '@material-ui/core';

describe('Catalog items details', () => {
  const server = setupServer();
  // Enable sane handlers for network requests
  registerMswTestHooks(server);

  // setup mock response
  beforeEach(() => {
    jest.restoreAllMocks();
    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
  });

  const render = (children: JSX.Element, catalogApi = mockCatalogApi) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, catalogApi],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <>{children}</>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  it('should render', async () => {
    await render(<CatalogItemsDetails />);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    const elements = screen.queryAllByText(
      /Use this template to create actual wizard use case templates/i,
    );
    expect(elements.length).toBeGreaterThan(0);
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('RedHat')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('service')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('aap-operations')).toBeInTheDocument();
    expect(screen.getByText('intermediate')).toBeInTheDocument();
  });

  it('renders loading state while fetching entity', async () => {
    const api = {
      ...mockCatalogApi,
      getEntityByRef: jest.fn(() => new Promise(() => {})),
    };
    await render(<CatalogItemsDetails />, api as any);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByText('Loading entity...')).toBeInTheDocument();
  });

  it('renders error state when getEntityByRef rejects', async () => {
    const api = {
      ...mockCatalogApi,
      getEntityByRef: jest
        .fn()
        .mockRejectedValue(new Error('Entity not found')),
    };
    await render(<CatalogItemsDetails />, api as any);
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
    expect(screen.getByText('Entity not found')).toBeInTheDocument();
  });

  it('renders no-data state when entity is undefined', async () => {
    const api = {
      ...mockCatalogApi,
      getEntityByRef: jest.fn().mockResolvedValue(undefined),
    };
    await render(<CatalogItemsDetails />, api as any);
    await waitFor(() => {
      expect(screen.getByText('No Data')).toBeInTheDocument();
    });
    expect(screen.getByText('No entity data available.')).toBeInTheDocument();
  });

  it('renders links section when entity has metadata links', async () => {
    const api = {
      ...mockCatalogApi,
      getEntityByRef: jest.fn().mockResolvedValue({
        metadata: {
          name: 'test-template',
          title: 'Test',
          description: 'A test template',
          namespace: 'default',
          tags: [],
          links: [
            { url: 'https://docs.example.com', title: 'Documentation' },
            { url: 'https://api.example.com', title: 'API Reference' },
          ],
        },
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        spec: { owner: 'team-a', type: 'service' },
      }),
    };
    await render(<CatalogItemsDetails />, api as any);
    await waitFor(() => {
      expect(screen.getByText('Links')).toBeInTheDocument();
    });
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(screen.getByText('API Reference')).toBeInTheDocument();
  });

  it('renders entity without links, tags, owner, or type fields', async () => {
    const api = {
      ...mockCatalogApi,
      getEntityByRef: jest.fn().mockResolvedValue({
        metadata: {
          name: 'bare-template',
          title: 'Bare Template',
          namespace: 'default',
        },
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        spec: {},
      }),
    };
    await render(<CatalogItemsDetails />, api as any);
    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    expect(screen.queryByText('Links')).not.toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('renders entity with empty links array (no Links section)', async () => {
    const api = {
      ...mockCatalogApi,
      getEntityByRef: jest.fn().mockResolvedValue({
        metadata: {
          name: 'no-links',
          title: 'No Links',
          namespace: 'default',
          links: [],
          tags: ['tag1'],
        },
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        spec: { owner: 'team-a', type: 'service' },
      }),
    };
    await render(<CatalogItemsDetails />, api as any);
    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    expect(screen.queryByText('Links')).not.toBeInTheDocument();
    expect(screen.getByText('tag1')).toBeInTheDocument();
  });

  it('renders empty strings for owner and type, "/" fallback only for missing description', async () => {
    const api = {
      ...mockCatalogApi,
      getEntityByRef: jest.fn().mockResolvedValue({
        metadata: {
          name: 'empty-fields',
          title: 'Empty Fields',
          namespace: 'default',
        },
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        spec: { owner: '', type: '' },
      }),
    };
    await render(<CatalogItemsDetails />, api as any);
    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    const slashes = screen.getAllByText('/');
    expect(slashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders correctly with dark theme', async () => {
    const darkTheme = createTheme({ palette: { type: 'dark' } });
    const component = (
      <ThemeProvider theme={darkTheme}>
        <CatalogItemsDetails />
      </ThemeProvider>
    );
    await render(component);
    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
    });
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });
});
