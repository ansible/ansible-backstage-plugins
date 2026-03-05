import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { Entity } from '@backstage/catalog-model';
import { RepositoryAboutCard } from './RepositoryAboutCard';

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

const createMockEntity = (overrides: Partial<Entity> = {}): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-repo',
    description: 'Test repository description',
    tags: ['ansible', 'test'],
    annotations: {
      'backstage.io/source-location': 'url:https://github.com/org/repo',
      'ansible.io/scm-provider': 'github',
      'ansible.io/scm-host': 'github.com',
      'ansible.io/scm-repository': 'org/repo',
    },
    ...overrides.metadata,
  },
  spec: {
    repository_name: 'test-repo',
    repository_default_branch: 'main',
    repository_collection_count: 3,
    repository_ee_count: 2,
    ...overrides.spec,
  },
});

describe('RepositoryAboutCard', () => {
  const mockOnViewSource = jest.fn();
  const mockOnNavigateToCollections = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders About title', () => {
    const entity = createMockEntity();
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('renders entity description', () => {
    const entity = createMockEntity();
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('Test repository description')).toBeInTheDocument();
  });

  it('renders default description when entity has no description', () => {
    const entity = createMockEntity({
      metadata: { name: 'test', description: undefined },
    });
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(
      screen.getByText(
        'Git repository discovered from Ansible content sources.',
      ),
    ).toBeInTheDocument();
  });

  it('renders default branch', () => {
    const entity = createMockEntity();
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('Default branch')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
  });

  it('renders em dash for missing default branch', () => {
    const entity = createMockEntity({
      spec: { repository_default_branch: undefined },
    });
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders collection and EE counts in Contains section', () => {
    const entity = createMockEntity();
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('Contains')).toBeInTheDocument();
    expect(screen.getByText('3 collections')).toBeInTheDocument();
    expect(screen.getByText(/2 EE definitions/)).toBeInTheDocument();
  });

  it('renders singular form for single collection', () => {
    const entity = createMockEntity({
      spec: { repository_collection_count: 1, repository_ee_count: 0 },
    });
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('1 collection')).toBeInTheDocument();
  });

  it('renders singular form for single EE', () => {
    const entity = createMockEntity({
      spec: { repository_collection_count: 0, repository_ee_count: 1 },
    });
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('1 EE definition')).toBeInTheDocument();
  });

  it('renders em dash when no collections or EEs', () => {
    const entity = createMockEntity({
      spec: { repository_collection_count: 0, repository_ee_count: 0 },
    });
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    const containsSection = screen.getByText('Contains').parentElement;
    expect(containsSection).toHaveTextContent('—');
  });

  it('renders tags', () => {
    const entity = createMockEntity();
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('ansible')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('does not render tags section when no tags', () => {
    const entity = createMockEntity({
      metadata: { name: 'test', tags: [] },
    });
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  it('calls onViewSource when source link is clicked', () => {
    const entity = createMockEntity();
    renderWithTheme(
      <RepositoryAboutCard entity={entity} onViewSource={mockOnViewSource} />,
    );

    const sourceLink = screen.getByText('github@github.com/org/repo.git');
    fireEvent.click(sourceLink);

    expect(mockOnViewSource).toHaveBeenCalledTimes(1);
  });

  it('renders collections as link when onNavigateToCollections is provided', () => {
    const entity = createMockEntity();
    renderWithTheme(
      <RepositoryAboutCard
        entity={entity}
        onNavigateToCollections={mockOnNavigateToCollections}
      />,
    );

    const collectionsLink = screen.getByText('3 collections');
    fireEvent.click(collectionsLink);

    expect(mockOnNavigateToCollections).toHaveBeenCalledTimes(1);
  });

  it('renders collections as text when onNavigateToCollections is not provided', () => {
    const entity = createMockEntity();
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    const collectionsText = screen.getByText('3 collections');
    expect(collectionsText.tagName).not.toBe('BUTTON');
  });

  it('renders Source section with link', () => {
    const entity = createMockEntity();
    renderWithTheme(<RepositoryAboutCard entity={entity} />);

    expect(screen.getByText('Source')).toBeInTheDocument();
  });
});
