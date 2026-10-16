import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { AnsibleComponents, EntityCatalogContent } from './CatalogContent';
import {
  catalogApiRef,
  EntityListProvider,
  starredEntitiesApiRef,
  MockStarredEntitiesApi,
  CatalogApi,
} from '@backstage/plugin-catalog-react';
import { Entity, ANNOTATION_EDIT_URL } from '@backstage/catalog-model';
import { configApiRef } from '@backstage/core-plugin-api';
import { mockConfigApi } from '../../tests/test_utils';

// Mock the react-use hook
jest.mock('react-use', () => ({
  ...jest.requireActual('react-use'),
  useEffectOnce: (fn: () => void) => {
    useEffect(fn, []); // eslint-disable-line react-hooks/exhaustive-deps
  },
}));

// Mock the hook that provides entity list functionality
const mockUpdateFilters = jest.fn();
const mockFilters = { user: { value: 'all' }, tags: null };

jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useEntityList: () => ({
    filters: mockFilters,
    updateFilters: mockUpdateFilters,
  }),
}));

describe('AnsibleComponents', () => {
  // Mock entities data
  const mockEntities: Entity[] = [
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'ansible-component-1',
        tags: ['ansible', 'automation'],
        annotations: {
          [ANNOTATION_EDIT_URL]:
            'https://github.com/example/repo/edit/main/component1.yaml',
        },
      },
      spec: {
        type: 'service',
        owner: 'team-ansible',
        system: 'automation-platform',
        lifecycle: 'production',
      },
    },
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'ansible-component-2',
        tags: ['ansible', 'playbook'],
        annotations: {
          [ANNOTATION_EDIT_URL]:
            'https://github.com/example/repo/edit/main/component2.yaml',
        },
      },
      spec: {
        type: 'library',
        owner: 'team-devops',
        system: 'devops-platform',
        lifecycle: 'experimental',
      },
    },
  ];

  let mockCatalogApi: jest.Mocked<CatalogApi>;
  let mockStarredEntitiesApi: MockStarredEntitiesApi;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create fresh mock APIs for each test
    mockCatalogApi = {
      getEntities: jest.fn(),
      getEntitiesByRefs: jest.fn(),
      queryEntities: jest.fn(),
      getEntityByRef: jest.fn(),
      refreshEntity: jest.fn(),
      getEntityAncestors: jest.fn(),
      getEntityFacets: jest.fn(),
      validateEntity: jest.fn(),
      addLocation: jest.fn(),
      getLocationByRef: jest.fn(),
      getLocationById: jest.fn(),
      removeEntityByUid: jest.fn(),
    } as any;

    mockStarredEntitiesApi = new MockStarredEntitiesApi();

    // Reset the filters mock
    mockFilters.user = { value: 'all' };
    mockFilters.tags = null;
  });

  const createTestApiProvider = () =>
    [
      [catalogApiRef, mockCatalogApi],
      [starredEntitiesApiRef, mockStarredEntitiesApi],
      [configApiRef, mockConfigApi],
    ] as const;

  const renderWithProviders = (component: React.ReactElement) => {
    const apis = createTestApiProvider();
    return renderInTestApp(
      <TestApiProvider apis={apis}>
        <EntityListProvider>{component}</EntityListProvider>
      </TestApiProvider>,
    );
  };

  describe('Loading State', () => {
    it('should display loading indicator initially', () => {
      // Mock API to never resolve to keep in loading state
      const neverResolvingPromise: Promise<any> = new Promise(() => undefined);
      mockCatalogApi.getEntities.mockReturnValue(neverResolvingPromise);

      const testApis = [
        [catalogApiRef, mockCatalogApi],
        [starredEntitiesApiRef, mockStarredEntitiesApi],
      ] as any;
      render(
        <TestApiProvider apis={testApis}>
          <AnsibleComponents />
        </TestApiProvider>,
      );

      // Check for progress indicator
      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should display entities table after successful API call', async () => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });

      await renderWithProviders(<AnsibleComponents />);

      // Wait for the table to appear
      await waitFor(() => {
        expect(
          screen.getByText(`All components (${mockEntities.length})`),
        ).toBeInTheDocument();
      });

      // Check that entities are displayed
      expect(screen.getByText('ansible-component-1')).toBeInTheDocument();
      expect(screen.getByText('ansible-component-2')).toBeInTheDocument();

      // Check table columns
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
      expect(screen.getByText('Owner')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Lifecycle')).toBeInTheDocument();
      expect(screen.getByText('Tags')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();

      // Verify API was called with correct parameters
      expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
        filter: [{ kind: 'component', 'metadata.tags': 'ansible' }],
      });
    });

    it('should display entity details correctly in table', async () => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });

      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        expect(screen.getByText('ansible-component-1')).toBeInTheDocument();
      });

      // Check spec fields are displayed
      expect(screen.getByText('team-ansible')).toBeInTheDocument();
      expect(screen.getByText('automation-platform')).toBeInTheDocument();
      expect(screen.getByText('devops-platform')).toBeInTheDocument();
      expect(screen.getByText('service')).toBeInTheDocument();
      expect(screen.getByText('production')).toBeInTheDocument();

      // Check tags are displayed as chips
      expect(screen.getAllByText('ansible')).toHaveLength(2); // Both entities have ansible tag
      expect(screen.getByText('automation')).toBeInTheDocument();
      expect(screen.getByText('playbook')).toBeInTheDocument();
    });

    it('should create proper navigation links for entity names', async () => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });

      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        expect(screen.getByText('ansible-component-1')).toBeInTheDocument();
      });

      const link = screen.getByRole('link', { name: 'ansible-component-1' });
      expect(link).toHaveAttribute(
        'href',
        '/catalog/default/component/ansible-component-1',
      );
    });
  });

  describe('Error Handling', () => {
    it('should display error message when API call fails', async () => {
      const errorMessage = 'Failed to fetch entities';
      mockCatalogApi.getEntities.mockRejectedValue(new Error(errorMessage));

      await renderWithProviders(<AnsibleComponents />);

      // Wait for error message to appear
      await waitFor(() => {
        expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
      });

      // Ensure no loading indicator is shown
      expect(screen.queryByTestId('progress')).not.toBeInTheDocument();
    });

    it('should display generic error message when error has no message', async () => {
      const errorWithoutMessage = new Error('');
      errorWithoutMessage.message = undefined as any;
      mockCatalogApi.getEntities.mockRejectedValue(errorWithoutMessage);

      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        expect(
          screen.getByText('Error: Unable to retrieve data'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Entity Filtering', () => {
    beforeEach(() => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });
      // Star the first entity for testing
      mockStarredEntitiesApi.toggleStarred(
        'component:default/ansible-component-1',
      );
    });

    it('should show all entities when filter is set to "all"', async () => {
      mockFilters.user = { value: 'all' };

      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        expect(
          screen.getByText(`All components (${mockEntities.length})`),
        ).toBeInTheDocument();
      });

      expect(screen.getByText('ansible-component-1')).toBeInTheDocument();
      expect(screen.getByText('ansible-component-2')).toBeInTheDocument();
    });

    it('should show only starred entities when filter is set to "starred"', async () => {
      mockFilters.user = { value: 'starred' };

      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        // Since only one entity is starred, the count should be 1
        expect(screen.getByText('All components (1)')).toBeInTheDocument();
      });

      // Only the starred entity should be visible
      expect(screen.getByText('ansible-component-1')).toBeInTheDocument();
      expect(screen.queryByText('ansible-component-2')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    beforeEach(() => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });
    });

    it('should display star icons for starring/unstarring entities', async () => {
      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        expect(screen.getByText('ansible-component-1')).toBeInTheDocument();
      });

      // Should have star icons (either filled or outline)
      const starIcons = screen.getAllByRole('button');
      expect(starIcons.length).toBeGreaterThan(0);
    });

    it('should display edit links with correct URLs', async () => {
      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        expect(screen.getByText('ansible-component-1')).toBeInTheDocument();
      });

      // Find edit links
      const allLinks = screen.getAllByRole('link');
      const editLinks = allLinks.filter(link => {
        const href = link.getAttribute('href');
        return href?.includes('github.com');
      });

      expect(editLinks).toHaveLength(2);
      expect(editLinks[0]).toHaveAttribute(
        'href',
        mockEntities[0].metadata.annotations![ANNOTATION_EDIT_URL],
      );
      expect(editLinks[1]).toHaveAttribute(
        'href',
        mockEntities[1].metadata.annotations![ANNOTATION_EDIT_URL],
      );
    });

    it('should open edit links in new tab', async () => {
      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        expect(screen.getByText('ansible-component-1')).toBeInTheDocument();
      });

      const allLinks = screen.getAllByRole('link');
      const editLinks = allLinks.filter(link => {
        const href = link.getAttribute('href');
        return href?.includes('github.com');
      });

      editLinks.forEach(link => {
        expect(link).toHaveAttribute('target', '_blank');
      });
    });
  });

  describe('Component Integration', () => {
    it('should call updateFilters on mount with correct ansible tag filter', async () => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });

      await renderWithProviders(<AnsibleComponents />);

      expect(mockUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.objectContaining({
            values: ['ansible'],
          }),
        }),
      );
    });

    it('should display correct filter UI components', async () => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });

      await renderWithProviders(<AnsibleComponents />);

      await waitFor(() => {
        expect(screen.getByText('Filters')).toBeInTheDocument();
      });

      // Should have user filter (starred/all)
      expect(screen.getByText('Starred')).toBeInTheDocument();
      expect(screen.getByText('All')).toBeInTheDocument();
    });
  });
});

describe('EntityCatalogContent', () => {
  let mockCatalogApi: jest.Mocked<CatalogApi>;
  let mockStarredEntitiesApi: MockStarredEntitiesApi;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCatalogApi = {
      getEntities: jest.fn(),
      getEntitiesByRefs: jest.fn(),
      queryEntities: jest.fn(),
      getEntityByRef: jest.fn(),
      refreshEntity: jest.fn(),
      getEntityAncestors: jest.fn(),
      getEntityFacets: jest.fn(),
      validateEntity: jest.fn(),
      addLocation: jest.fn(),
      getLocationByRef: jest.fn(),
      getLocationById: jest.fn(),
      removeEntityByUid: jest.fn(),
    } as any;

    mockStarredEntitiesApi = new MockStarredEntitiesApi();
  });

  it('should render AnsibleComponents wrapped in EntityListProvider', async () => {
    const mockEntities: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-component',
          tags: ['ansible'],
          annotations: {},
        },
        spec: {
          type: 'service',
          owner: 'team-test',
        },
      },
    ];

    mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [starredEntitiesApiRef, mockStarredEntitiesApi],
          [configApiRef, mockConfigApi],
        ]}
      >
        <EntityCatalogContent />
      </TestApiProvider>,
    );

    // Should render the table with components
    await waitFor(() => {
      expect(screen.getByText('All components (1)')).toBeInTheDocument();
    });

    // Should display the component
    expect(screen.getByText('test-component')).toBeInTheDocument();
  });

  it('should provide proper grid layout structure', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

    const { container } = await renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [starredEntitiesApiRef, mockStarredEntitiesApi],
          [configApiRef, mockConfigApi],
        ]}
      >
        <EntityCatalogContent />
      </TestApiProvider>,
    );

    // Should have proper Material-UI Grid structure
    const gridContainer = container.querySelector('.MuiGrid-container');
    expect(gridContainer).toBeInTheDocument();
  });
});
