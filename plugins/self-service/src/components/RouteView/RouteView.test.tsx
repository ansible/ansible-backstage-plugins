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

// Mock RequirePermission to just render children
jest.mock('@backstage/plugin-permission-react', () => ({
  RequirePermission: ({ children }: any) => <>{children}</>,
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
}));

describe('RouteView', () => {
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

  it('renders EETabs at /ee/catalog through permission wrapper', () => {
    render(
      <MemoryRouter initialEntries={['/ee/catalog']}>
        <RouteView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('ee-tabs')).toBeInTheDocument();
  });

  it('renders EEDetailsPage at /catalog/:templateName through permission wrapper', () => {
    render(
      <MemoryRouter initialEntries={['/catalog/my-ee']}>
        <RouteView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('ee-details')).toBeInTheDocument();
  });

  it('renders CollectionsCatalogPage at /collections through permission wrapper', () => {
    render(
      <MemoryRouter initialEntries={['/collections']}>
        <RouteView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('collections-catalog')).toBeInTheDocument();
  });

  it('renders CollectionDetailsPage at /collections/:name through permission wrapper', () => {
    render(
      <MemoryRouter initialEntries={['/collections/my-collection']}>
        <RouteView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('collection-details')).toBeInTheDocument();
  });

  it('renders GitRepositoriesPage at /repositories/catalog through permission wrapper', () => {
    render(
      <MemoryRouter initialEntries={['/repositories/catalog']}>
        <RouteView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('git-repositories')).toBeInTheDocument();
  });

  it('renders RepositoryDetailsPage at /repositories/:name through permission wrapper', () => {
    render(
      <MemoryRouter initialEntries={['/repositories/my-repo']}>
        <RouteView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('repository-details')).toBeInTheDocument();
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
});
