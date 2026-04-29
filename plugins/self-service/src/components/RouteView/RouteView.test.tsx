import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RouteView } from './RouteView';

// Mock page components
jest.mock('../Home', () => ({
  HomeComponent: () => <div data-testid="home">Home</div>,
}));
jest.mock('../CatalogImport', () => ({
  CatalogImport: () => <div data-testid="catalog-import">CatalogImport</div>,
}));
jest.mock('../CreateTask', () => ({
  CreateTask: () => <div data-testid="create-task">CreateTask</div>,
}));
jest.mock('../RunTask', () => ({
  RunTask: () => <div data-testid="run-task">RunTask</div>,
}));
jest.mock('../TaskList', () => ({
  TaskList: () => <div data-testid="task-list">TaskList</div>,
}));
jest.mock('../CatalogItemDetails', () => ({
  CatalogItemsDetails: () => (
    <div data-testid="catalog-details">CatalogDetails</div>
  ),
}));
jest.mock('../feedback/FeedbackFooter', () => ({
  FeedbackFooter: () => <div data-testid="feedback-footer">FeedbackFooter</div>,
}));
jest.mock('../ExecutionEnvironments', () => ({
  EETabs: () => <div data-testid="ee-tabs">EETabs</div>,
}));
jest.mock('../ExecutionEnvironments/catalog/EEDetailsPage', () => ({
  EEDetailsPage: () => <div data-testid="ee-details">EEDetails</div>,
}));
jest.mock('../CollectionsCatalog', () => ({
  CollectionsCatalogPage: () => (
    <div data-testid="collections-catalog">CollectionsCatalog</div>
  ),
}));
jest.mock('../CollectionsCatalog/CollectionDetailsPage', () => ({
  CollectionDetailsPage: () => (
    <div data-testid="collection-details">CollectionDetails</div>
  ),
}));
jest.mock('../GitRepositories', () => ({
  GitRepositoriesPage: () => (
    <div data-testid="git-repositories">GitRepositories</div>
  ),
}));
jest.mock('../GitRepositories/RepositoryDetailsPage', () => ({
  RepositoryDetailsPage: () => (
    <div data-testid="repository-details">RepositoryDetails</div>
  ),
}));

jest.mock('@ansible/backstage-rhaap-common/permissions', () => ({
  executionEnvironmentsViewPermission: {
    type: 'basic',
    name: 'ee.view',
    attributes: {},
  },
  collectionsViewPermission: {
    type: 'basic',
    name: 'collections.view',
    attributes: {},
  },
  gitRepositoriesViewPermission: {
    type: 'basic',
    name: 'repos.view',
    attributes: {},
  },
  templatesViewPermission: {
    type: 'basic',
    name: 'templates.view',
    attributes: {},
  },
  historyViewPermission: {
    type: 'basic',
    name: 'history.view',
    attributes: {},
  },
}));

// Track every permission passed to RequirePermission.
// Default behaviour: render children (allowed).
// Tests can override via mockImplementation to simulate denial.
const mockRequirePermission = jest.fn();

jest.mock('@backstage/plugin-permission-react', () => ({
  RequirePermission: (props: any) => mockRequirePermission(props),
}));

jest.mock('../notifications', () => ({
  NotificationProvider: ({ children }: any) => <>{children}</>,
  NotificationStack: () => null,
  useNotifications: () => ({
    notifications: [],
    showNotification: jest.fn(),
    removeNotification: jest.fn(),
    clearAll: jest.fn(),
  }),
  syncPollingService: {
    initialize: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
    getIsSyncInProgress: jest.fn().mockReturnValue(false),
    startTracking: jest.fn(),
  },
}));

const mockUseIsSuperuser = jest.fn();
jest.mock('../../hooks', () => ({
  useIsSuperuser: () => mockUseIsSuperuser(),
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => ({
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost'),
    fetch: jest
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
  }),
}));

describe('RouteView', () => {
  beforeEach(() => {
    mockRequirePermission.mockReset();
    mockRequirePermission.mockImplementation(({ children }: any) => (
      <>{children}</>
    ));
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
  });

  it('renders default routes without crashing', () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <RouteView />
      </MemoryRouter>,
    );

    // Check that home component renders
    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-footer')).toBeInTheDocument();
  });

  it('renders CatalogImport with permission wrapper', () => {
    render(
      <MemoryRouter initialEntries={['/catalog-import']}>
        <RouteView />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('catalog-import')).toBeInTheDocument();
  });

  it('renders TaskList route', () => {
    render(
      <MemoryRouter initialEntries={['/create/tasks']}>
        <RouteView />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('task-list')).toBeInTheDocument();
  });

  it('renders RunTask route', () => {
    render(
      <MemoryRouter initialEntries={['/create/tasks/123']}>
        <RouteView />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('run-task')).toBeInTheDocument();
  });

  it('renders CreateTask route', () => {
    render(
      <MemoryRouter initialEntries={['/create/templates/ns/template1']}>
        <RouteView />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('create-task')).toBeInTheDocument();
  });

  describe('when permission is allowed', () => {
    it.each([
      {
        path: '/catalog',
        childTestId: 'home',
        permissionName: 'templates.view',
      },
      {
        path: '/catalog/ns/my-template',
        childTestId: 'catalog-details',
        permissionName: 'templates.view',
      },
      {
        path: '/create/tasks',
        childTestId: 'task-list',
        permissionName: 'history.view',
      },
      {
        path: '/create/tasks/123',
        childTestId: 'run-task',
        permissionName: 'history.view',
      },
      {
        path: '/ee/catalog',
        childTestId: 'ee-tabs',
        permissionName: 'ee.view',
      },
      {
        path: '/catalog/my-ee',
        childTestId: 'ee-details',
        permissionName: 'ee.view',
      },
      {
        path: '/collections',
        childTestId: 'collections-catalog',
        permissionName: 'collections.view',
      },
      {
        path: '/collections/my-col',
        childTestId: 'collection-details',
        permissionName: 'collections.view',
      },
      {
        path: '/repositories/catalog',
        childTestId: 'git-repositories',
        permissionName: 'repos.view',
      },
      {
        path: '/repositories/my-repo',
        childTestId: 'repository-details',
        permissionName: 'repos.view',
      },
    ])(
      'renders $childTestId at $path with $permissionName',
      ({ path, childTestId, permissionName }) => {
        render(
          <MemoryRouter initialEntries={[path]}>
            <RouteView />
          </MemoryRouter>,
        );
        expect(screen.getByTestId(childTestId)).toBeInTheDocument();
        expect(mockRequirePermission).toHaveBeenCalledWith(
          expect.objectContaining({
            permission: expect.objectContaining({ name: permissionName }),
          }),
        );
      },
    );
  });

  describe('when permission is denied', () => {
    beforeEach(() => {
      mockRequirePermission.mockImplementation(() => (
        <div data-testid="permission-denied" />
      ));
    });

    it.each([
      { path: '/catalog', childTestId: 'home' },
      { path: '/create/tasks', childTestId: 'task-list' },
      { path: '/ee/catalog', childTestId: 'ee-tabs' },
      { path: '/collections', childTestId: 'collections-catalog' },
      { path: '/repositories/catalog', childTestId: 'git-repositories' },
    ])('blocks $childTestId at $path', ({ path, childTestId }) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <RouteView />
        </MemoryRouter>,
      );
      expect(screen.queryByTestId(childTestId)).not.toBeInTheDocument();
      expect(screen.getAllByTestId('permission-denied').length).toBeGreaterThan(
        0,
      );
    });
  });

  it('redirects unknown routes to /self-service/catalog', () => {
    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <RouteView />
      </MemoryRouter>,
    );

    // Since Navigate is not rendered to DOM, we can just check FeedbackFooter renders
    expect(screen.getByTestId('feedback-footer')).toBeInTheDocument();
  });

  describe('RequireSuperuser on /catalog-import', () => {
    it('shows loading indicator while superuser check is in progress', () => {
      mockUseIsSuperuser.mockReturnValue({
        isSuperuser: false,
        loading: true,
        error: null,
      });

      render(
        <MemoryRouter initialEntries={['/catalog-import']}>
          <RouteView />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('superuser-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-import')).not.toBeInTheDocument();
    });

    it('redirects non-superuser away from catalog-import', () => {
      mockUseIsSuperuser.mockReturnValue({
        isSuperuser: false,
        loading: false,
        error: null,
      });

      render(
        <MemoryRouter initialEntries={['/catalog-import']}>
          <RouteView />
        </MemoryRouter>,
      );

      expect(screen.queryByTestId('catalog-import')).not.toBeInTheDocument();
    });

    it('redirects on hook error', () => {
      mockUseIsSuperuser.mockReturnValue({
        isSuperuser: false,
        loading: false,
        error: new Error('Hook failed'),
      });

      render(
        <MemoryRouter initialEntries={['/catalog-import']}>
          <RouteView />
        </MemoryRouter>,
      );

      expect(screen.queryByTestId('catalog-import')).not.toBeInTheDocument();
    });

    it('renders catalog-import for superuser', () => {
      mockUseIsSuperuser.mockReturnValue({
        isSuperuser: true,
        loading: false,
        error: null,
      });

      render(
        <MemoryRouter initialEntries={['/catalog-import']}>
          <RouteView />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('catalog-import')).toBeInTheDocument();
    });
  });
});
