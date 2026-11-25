import { render, screen, waitFor } from '@testing-library/react';
import type { Entity } from '@backstage/catalog-model';
import {
  StockRepositoryReadme,
  StockRepositoryCI,
  StockRepositoryCollections,
} from './StockRepositoryContent';

let mockAllowed = true;
let mockEntity: Entity;
const mockReadFile = jest.fn();
const mockCI = jest.fn();
const mockCollections = jest.fn();
const mockApi = {};

jest.mock('@backstage/plugin-catalog-react', () => ({
  useEntity: () => ({ entity: mockEntity }),
  EntityListProvider: ({ children }: any) => children,
}));
jest.mock('@backstage/core-plugin-api', () => ({
  useApi: () => mockApi,
  discoveryApiRef: {},
  fetchApiRef: {},
}));
jest.mock('@backstage/plugin-permission-react', () => ({
  RequirePermission: ({ children }: any) =>
    mockAllowed ? children : <span>Denied</span>,
}));
jest.mock('@ansible/aap-common/permissions', () => ({
  gitRepositoriesViewPermission: {},
}));
jest.mock('../components/common', () => ({
  fetchGitFileContentFromBackend: (...args: unknown[]) => mockReadFile(...args),
}));
jest.mock('../components/GitRepositories/RepositoryReadmeCard', () => ({
  RepositoryReadmeCard: ({ readmeContent, isLoading }: any) => (
    <div>{isLoading ? 'Loading README' : readmeContent || 'README absent'}</div>
  ),
}));
jest.mock('../components/GitRepositories/RepositoriesCIActivityTab', () => ({
  RepositoriesCIActivityTab: (props: unknown) => {
    mockCI(props);
    return <div>CI content</div>;
  },
}));
jest.mock('../components/GitRepositories/RepositoryAboutCard', () => ({
  RepositoryAboutCard: () => null,
}));
jest.mock('../components/CollectionsCatalog/CollectionsListPage', () => ({
  CollectionsListPage: (props: unknown) => {
    mockCollections(props);
    return <div>Collections content</div>;
  },
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAllowed = true;
  mockEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'repository-one',
      namespace: 'engineering',
      annotations: {
        'ansible.io/scm-provider': 'gitlab',
        'ansible.io/scm-host': 'gitlab.example.org',
        'ansible.io/scm-organization': 'team/subgroup',
        'ansible.io/scm-repository': 'repo',
      },
    },
    spec: { type: 'git-repository', repository_default_branch: 'release' },
  };
});

it('uses authenticated backend file loading with this repository and its branch', async () => {
  mockReadFile.mockResolvedValue({ ok: true, data: 'Repository README' });
  render(<StockRepositoryReadme />);
  expect(await screen.findByText('Repository README')).toBeInTheDocument();
  expect(mockReadFile).toHaveBeenCalledWith(
    {},
    {},
    expect.objectContaining({
      scmProvider: 'gitlab',
      scmOrg: 'team/subgroup',
      scmRepo: 'repo',
      gitRef: 'release',
    }),
  );
});

it('does not fetch README data when repository permission is denied', () => {
  mockAllowed = false;
  render(<StockRepositoryReadme />);
  expect(screen.getByText('Denied')).toBeInTheDocument();
  expect(mockReadFile).not.toHaveBeenCalled();
});

it('does not mount the CI loader when permission is denied', () => {
  mockAllowed = false;
  render(<StockRepositoryCI />);
  expect(mockCI).not.toHaveBeenCalled();
});

it('scopes CI to the actual entity including its namespace, not a fleet query', () => {
  render(<StockRepositoryCI />);
  expect(mockCI).toHaveBeenCalledWith({
    filterByEntity: mockEntity,
    cachedEntities: [mockEntity],
  });
});

it('scopes the existing Collections page to the selected repository', () => {
  render(<StockRepositoryCollections />);
  expect(mockCollections).toHaveBeenCalledWith({
    filterByRepositoryEntity: mockEntity,
  });
});

it('ignores an old repository README response after the entity changes', async () => {
  let resolveOld: (value: unknown) => void = () => {};
  mockReadFile
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce({ ok: true, data: 'New repository README' });
  const view = render(<StockRepositoryReadme />);
  mockEntity = {
    ...mockEntity,
    metadata: { ...mockEntity.metadata, name: 'repository-two' },
  };
  view.rerender(<StockRepositoryReadme />);
  await screen.findByText('New repository README');
  resolveOld({ ok: true, data: 'Stale README' });
  await waitFor(() =>
    expect(screen.queryByText('Stale README')).not.toBeInTheDocument(),
  );
});
