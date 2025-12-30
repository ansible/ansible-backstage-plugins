import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { MemoryRouter } from 'react-router-dom';
import { EEListPage } from './CatalogContent';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
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
  spec: { owner: 'team-a', type: 'execution-environment' },
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
  spec: { owner: 'team-b', type: 'execution-environment' },
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
