import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { MemoryRouter } from 'react-router-dom';
import { EEListPage } from './CatalogContent';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { Entity } from '@backstage/catalog-model';
// import { within } from '@testing-library/react';

// ------------------ STUB: core components (Table, Link) ------------------
jest.mock('@backstage/core-components', () => {
  const actual = jest.requireActual('@backstage/core-components');
  return {
    ...actual,
    // Table stub now calls column.render(entity) for each column when present,
    // so Action column renderers (YellowStar/Edit) run and are part of the DOM.
    Table: ({ title, data = [], columns = [] }: any) => (
      <div data-testid="stubbed-table">
        <div data-testid="stubbed-table-title">{title}</div>
        <div data-testid="stubbed-table-rows">
          {Array.isArray(data)
            ? data.map((entity: any, rowIndex: number) => (
                <div key={rowIndex} data-testid={`row-${rowIndex}`}>
                  {columns.map((col: any, colIndex: number) => {
                    let cellContent: any = null;

                    if (typeof col.render === 'function') {
                      cellContent = col.render(entity);
                    } else if (col.field) {
                      cellContent = col.field
                        .split('.')
                        .reduce((acc: any, k: string) => acc?.[k], entity);
                    }
                    return (
                      <span
                        key={colIndex}
                        data-testid={`row-${rowIndex}-col-${colIndex}`}
                      >
                        {cellContent}
                      </span>
                    );
                  })}
                </div>
              ))
            : null}
        </div>
      </div>
    ),
    // Simple stub for Link that renders an anchor with children
    Link: ({ to, children, ...rest }: any) => (
      // eslint-disable-next-line jsx-a11y/anchor-is-valid
      <a href={to} {...rest} data-testid="stubbed-link">
        {children}
      </a>
    ),
  };
});

// ------------------ STUB: plugin-catalog-react internals ------------------
jest.mock('@backstage/plugin-catalog-react', () => {
  const actual = jest.requireActual('@backstage/plugin-catalog-react');

  // CatalogFilterLayout stub: keeps Filters/Content slots
  const CatalogFilterLayout = ({ children }: any) => (
    <div data-testid="catalog-filter-layout">{children}</div>
  );
  CatalogFilterLayout.Filters = ({ children }: any) => (
    <div data-testid="catalog-filters">{children}</div>
  );
  CatalogFilterLayout.Content = ({ children }: any) => (
    <div data-testid="catalog-content">{children}</div>
  );

  // UserListPicker stub (renders availableFilters string for visibility)
  const UserListPicker = ({ availableFilters }: any) => (
    <div data-testid="user-list-picker">
      {availableFilters?.join?.(',') || ''}
    </div>
  );

  // Simple useEntityList stub that provides filters and updateFilters
  const useEntityList = () => ({
    filters: { user: { value: 'all' } },
    updateFilters: jest.fn(),
  });

  // UseStarredEntities stub with spies that tests can inspect/override
  const toggleStarredEntityMock = jest.fn();
  const isStarredEntityMock = jest.fn(() => false);
  const useStarredEntities = () => ({
    isStarredEntity: isStarredEntityMock,
    toggleStarredEntity: toggleStarredEntityMock,
  });

  return {
    ...actual,
    CatalogFilterLayout,
    UserListPicker,
    useEntityList,
    useStarredEntities,
    // preserve the real catalogApiRef from the actual module
    catalogApiRef: actual.catalogApiRef,
  };
});

// ------------------ STUB your local modules ------------------
jest.mock('./Favourites', () => ({
  YellowStar: () => <span data-testid="yellow-star">★</span>,
}));

jest.mock('./CreateCatalog', () => ({
  CreateCatalog: () => <div data-testid="create-catalog">CreateCatalog</div>,
}));

// ------------------ Test data ------------------
const entityA = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'ee-one',
    description: 'Execution env one',
    tags: ['ansible', 'linux'],
    annotations: { 'backstage.io/edit-url': 'http://edit/ee-one' },
  },
  spec: { owner: 'user:default/team-a', type: 'execution-environment' },
};

const entityB = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'ee-two',
    description: 'Execution env two',
    tags: ['docker'],
    annotations: { 'backstage.io/edit-url': 'http://edit/ee-two' },
  },
  spec: { owner: 'user:default/team-b', type: 'execution-environment' },
};

// MUI theme (keeps Select/inputs happy)
const theme = createMuiTheme();

// ------------------ Render helper (only catalogApiRef provided) ------------------
const renderWithCatalogApi = (getEntitiesImpl: any) => {
  const getOwnerTitle = (ref: string): string => {
    if (ref === 'team-a') return 'Team A';
    if (ref === 'team-b') return 'Team B';
    return ref;
  };

  const mockCatalogApi = {
    getEntities: getEntitiesImpl,
    getEntityByRef: jest.fn((ref: string) =>
      Promise.resolve({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: ref,
          title: getOwnerTitle(ref),
        },
      }),
    ),
  };
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
        <ThemeProvider theme={theme}>
          <EEListPage onTabSwitch={jest.fn()} />
        </ThemeProvider>
      </TestApiProvider>
    </MemoryRouter>,
  );
};

// ------------------ Tests ------------------
describe('EEListPage (unit — internals stubbed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders table when catalog returns entities', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [entityA, entityB] }));

    // wait for the stubbed table title to appear
    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    // rows should exist (we stubbed table to render metadata.name)
    expect(screen.getByText('ee-one')).toBeInTheDocument();
    expect(screen.getByText('ee-two')).toBeInTheDocument();

    // ensure title contains the count (EEListPage composes the title string)
    expect(screen.getByTestId('stubbed-table-title').textContent).toMatch(
      /\(\d+\)/,
    );
  });

  test('renders CreateCatalog when no entities returned', async () => {
    renderWithCatalogApi(() => Promise.resolve({ items: [] }));

    await waitFor(() =>
      expect(screen.getByTestId('create-catalog')).toBeInTheDocument(),
    );
  });

  test('shows error UI when API rejects', async () => {
    renderWithCatalogApi(() => Promise.reject(new Error('boom-fetch')));

    // Wait for the rendered error text
    await waitFor(() =>
      expect(screen.getByText(/Error:|boom-fetch/i)).toBeInTheDocument(),
    );
  });

  test('clicking star calls toggleStarredEntity', async () => {
    // make the module-level useStarredEntities report the entity as starred so YellowStar renders
    const pluginMock = jest.requireMock('@backstage/plugin-catalog-react');
    (
      pluginMock.useStarredEntities().isStarredEntity as jest.Mock
    ).mockImplementation(() => true);

    renderWithCatalogApi(() => Promise.resolve({ items: [entityA] }));

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    const star = screen.getByTestId('yellow-star');
    expect(star).toBeTruthy();

    fireEvent.click(star);

    expect(
      pluginMock.useStarredEntities().toggleStarredEntity,
    ).toHaveBeenCalled();
  });
});

// ------------------ Tests for fetchOwnerNames and getOwnerName ------------------
describe('fetchOwnerNames and getOwnerName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getOwnerName returns title when available', async () => {
    const mockGetEntityByRef = jest.fn((ref: string) =>
      Promise.resolve({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: ref,
          title: 'Team A Title',
        },
      }),
    );

    const mockCatalogApi = {
      getEntities: () => Promise.resolve({ items: [entityA] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    // Wait for owner names to be fetched and rendered
    await waitFor(() => {
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-a');
    });

    // Verify owner name is displayed (title takes precedence)
    await waitFor(() => {
      const ownerCells = screen.getAllByText('Team A Title');
      expect(ownerCells.length).toBeGreaterThan(0);
    });
  });

  test('getOwnerName returns name when title is not available', async () => {
    const mockGetEntityByRef = jest.fn((_ref: string) =>
      Promise.resolve({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: 'team-a-name',
          // no title
        },
      }),
    );

    const mockCatalogApi = {
      getEntities: () => Promise.resolve({ items: [entityA] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    await waitFor(() => {
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-a');
    });

    // Verify owner name is displayed (name is used when title is missing)
    await waitFor(() => {
      const ownerCells = screen.getAllByText('team-a-name');
      expect(ownerCells.length).toBeGreaterThan(0);
    });
  });

  test('getOwnerName returns ownerRef when entity is not found', async () => {
    const mockGetEntityByRef = jest.fn(
      (_ref: string) => Promise.resolve(undefined), // Entity not found
    );

    const mockCatalogApi = {
      getEntities: () => Promise.resolve({ items: [entityA] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    await waitFor(() => {
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-a');
    });

    // Verify owner ref is displayed when entity is not found (fallback to ref)
    await waitFor(() => {
      const ownerCells = screen.getAllByText('user:default/team-a');
      expect(ownerCells.length).toBeGreaterThan(0);
    });
  });

  test('getOwnerName returns Unknown when ownerRef is undefined', async () => {
    const entityWithoutOwner = {
      ...entityA,
      spec: { ...entityA.spec, owner: undefined },
    };

    const mockCatalogApi = {
      getEntities: () => Promise.resolve({ items: [entityWithoutOwner] }),
      getEntityByRef: jest.fn(),
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    // getEntityByRef should not be called when owner is undefined
    expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();

    // Verify "Unknown" is displayed for entity without owner
    await waitFor(() => {
      const unknownCells = screen.getAllByText('Unknown');
      expect(unknownCells.length).toBeGreaterThan(0);
    });
  });

  test('fetchOwnerNames extracts unique owner refs correctly', async () => {
    const entityC = {
      ...entityA,
      metadata: { ...entityA.metadata, name: 'ee-three' },
      spec: { ...entityA.spec, owner: 'user:default/team-a' }, // duplicate owner
    };

    const mockGetEntityByRef = jest.fn((ref: string) =>
      Promise.resolve({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: ref,
          title: `Team ${ref.split('-')[1].toUpperCase()}`,
        },
      }),
    );

    const mockCatalogApi = {
      getEntities: () =>
        Promise.resolve({ items: [entityA, entityB, entityC] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    // fetchOwnerNames should only call getEntityByRef for unique owners
    await waitFor(() => {
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-a');
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-b');
      // Should not be called more than once per unique owner
      expect(mockGetEntityByRef).toHaveBeenCalledTimes(2);
    });
  });

  test('fetchOwnerNames handles entities with no owner', async () => {
    const entityWithoutOwner = {
      ...entityA,
      spec: { ...entityA.spec, owner: undefined },
    };
    const entityWithOwner = {
      ...entityB,
    };

    const mockGetEntityByRef = jest.fn((ref: string) =>
      Promise.resolve({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: ref,
          title: `Team ${ref.split('-')[1].toUpperCase()}`,
        },
      }),
    );

    const mockCatalogApi = {
      getEntities: () =>
        Promise.resolve({ items: [entityWithoutOwner, entityWithOwner] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    // Should only call getEntityByRef for entities that have an owner
    await waitFor(() => {
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-b');
      expect(mockGetEntityByRef).not.toHaveBeenCalledWith(undefined);
      expect(mockGetEntityByRef).toHaveBeenCalledTimes(1);
    });
  });

  test('fetchOwnerNames handles empty entities array', async () => {
    const mockGetEntityByRef = jest.fn();

    const mockCatalogApi = {
      getEntities: () => Promise.resolve({ items: [] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('create-catalog')).toBeInTheDocument(),
    );

    // getEntityByRef should not be called when there are no entities
    expect(mockGetEntityByRef).not.toHaveBeenCalled();
  });

  test('fetchOwnerNames updates ownerNames state correctly', async () => {
    const mockGetEntityByRef = jest.fn((ref: string) =>
      Promise.resolve({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: ref,
          title: `Title for ${ref}`,
        },
      }),
    );

    const mockCatalogApi = {
      getEntities: () => Promise.resolve({ items: [entityA, entityB] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    // Wait for owner names to be fetched
    await waitFor(() => {
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-b');
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-b');
    });

    // Verify owner names are displayed in the table (using titles)
    await waitFor(() => {
      expect(
        screen.getByText('Title for user:default/team-b'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Title for user:default/team-b'),
      ).toBeInTheDocument();
    });
  });

  test('getOwnerName handles API errors gracefully', async () => {
    const mockGetEntityByRef = jest.fn((_ref: string) =>
      Promise.reject(new Error('Failed to fetch entity')),
    );

    const mockCatalogApi = {
      getEntities: () => Promise.resolve({ items: [entityA] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    // getEntityByRef should be called
    await waitFor(() => {
      expect(mockGetEntityByRef).toHaveBeenCalledWith('user:default/team-a');
    });

    // When getEntityByRef fails, the owner ref should still be displayed as fallback
    // (The component should handle the error and show the ref)
    await waitFor(() => {
      // The table should still render
      expect(screen.getByText('ee-one')).toBeInTheDocument();
      // Owner column should show the ref as fallback when API fails
      expect(screen.getByText('user:default/team-a')).toBeInTheDocument();
    });
  });

  test('Owner column falls back to ownerRef when not in ownerNames map', async () => {
    // Create an entity with an ownerRef that won't be in the ownerNames map
    const entityWithOwner = {
      ...entityA,
      spec: { ...entityA.spec, owner: 'user:default/unmapped-owner' },
    };

    // Mock getEntityByRef to never resolve, simulating a case where
    // fetchOwnerNames hasn't completed yet or the ownerRef wasn't fetched
    const mockGetEntityByRef = jest.fn(
      () => new Promise<Entity | undefined>(() => {}),
    ); // Never resolves

    const mockCatalogApi = {
      getEntities: () => Promise.resolve({ items: [entityWithOwner] }),
      getEntityByRef: mockGetEntityByRef,
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <ThemeProvider theme={theme}>
            <EEListPage onTabSwitch={jest.fn()} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stubbed-table-title')).toBeInTheDocument(),
    );

    // Before fetchOwnerNames completes, ownerNames.get() returns undefined,
    // so the || ownerRef fallback should be used
    await waitFor(() => {
      expect(
        screen.getByText('user:default/unmapped-owner'),
      ).toBeInTheDocument();
    });
  });
});
