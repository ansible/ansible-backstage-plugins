import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { Entity } from '@backstage/catalog-model';
import { CollectionAboutCard } from './CollectionAboutCard';

const theme = createTheme();

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-collection',
    description: 'Test collection description',
    tags: ['tag1', 'ansible-collection'],
    annotations: {
      'ansible.io/collection-source': 'pah',
      'ansible.io/collection-source-repository': 'repo1',
      'backstage.io/source-url': 'https://example.com/source',
    },
  },
  spec: {
    type: 'ansible-collection',
    collection_version: '1.0.0',
    collection_authors: ['Author One', 'Author Two'],
    collection_license: 'Apache-2.0',
  } as any,
};

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CollectionAboutCard', () => {
  const mockOnViewSource = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders About title and description', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={mockEntity}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );

    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Test collection description')).toBeInTheDocument();
  });

  it('renders authors section', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={mockEntity}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );

    expect(screen.getByText('Authors')).toBeInTheDocument();
    expect(screen.getByText('Author One, Author Two')).toBeInTheDocument();
  });

  it('renders single author as "Author"', () => {
    const entity: Entity = {
      ...mockEntity,
      spec: {
        ...mockEntity.spec,
        collection_authors: ['Solo Author'],
      } as any,
    };

    renderWithTheme(
      <CollectionAboutCard
        entity={entity}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );

    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Solo Author')).toBeInTheDocument();
  });

  it('renders version and license', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={mockEntity}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );

    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('License')).toBeInTheDocument();
    expect(screen.getByText('Apache-2.0')).toBeInTheDocument();
  });

  it('renders source link and calls onViewSource when clicked', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={mockEntity}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );

    const sourceLink = screen.getByText('Private Automation Hub (repo1)');
    expect(sourceLink).toBeInTheDocument();

    fireEvent.click(sourceLink);
    expect(mockOnViewSource).toHaveBeenCalledTimes(1);
  });

  it('renders refresh button when onRefresh provided', () => {
    const mockOnRefresh = jest.fn();
    renderWithTheme(
      <CollectionAboutCard
        entity={mockEntity}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
        onRefresh={mockOnRefresh}
      />,
    );

    const refreshButton = screen.getByTitle('Refresh').closest('button');
    expect(refreshButton).toBeInTheDocument();
    fireEvent.click(refreshButton!);
    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables refresh button when isRefreshing is true', () => {
    const mockOnRefresh = jest.fn();
    renderWithTheme(
      <CollectionAboutCard
        entity={mockEntity}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
        onRefresh={mockOnRefresh}
        isRefreshing
      />,
    );

    const refreshButton = screen.getByTitle('Refresh').closest('button');
    expect(refreshButton).toBeDisabled();
  });

  it('renders Last Sync section', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={mockEntity}
        lastSync="2024-06-15T10:00:00Z"
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );

    expect(screen.getByText('Last Sync')).toBeInTheDocument();
  });

  it('renders tags from spec.collection_tags', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={{
          ...mockEntity,
          spec: {
            ...mockEntity.spec,
            collection_tags: ['tag1', 'other-tag'],
          } as any,
        }}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );

    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('other-tag')).toBeInTheDocument();
  });

  it('renders "No description available" when description missing', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={{
          ...mockEntity,
          metadata: { ...mockEntity.metadata, description: undefined },
        }}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );
    expect(screen.getByText('No description available.')).toBeInTheDocument();
  });

  it('renders "Unknown" when no authors', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={{
          ...mockEntity,
          spec: {
            ...mockEntity.spec,
            collection_authors: [],
          } as any,
        }}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('does not render License section when license empty', () => {
    renderWithTheme(
      <CollectionAboutCard
        entity={{
          ...mockEntity,
          spec: {
            ...mockEntity.spec,
            collection_license: undefined,
          } as any,
        }}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.queryByText('License')).not.toBeInTheDocument();
  });

  it('renders source as text when no source url', () => {
    const annotations = { ...mockEntity.metadata.annotations };
    delete annotations['backstage.io/source-url'];
    renderWithTheme(
      <CollectionAboutCard
        entity={{
          ...mockEntity,
          metadata: { ...mockEntity.metadata, annotations },
        }}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );
    expect(
      screen.getByText('Private Automation Hub (repo1)'),
    ).toBeInTheDocument();
  });

  it('shows "No tags" when no displayable tags', () => {
    const entity: Entity = {
      ...mockEntity,
      metadata: { ...mockEntity.metadata, tags: ['ansible-collection'] },
    };

    renderWithTheme(
      <CollectionAboutCard
        entity={entity}
        lastSync={null}
        lastFailedSync={null}
        onViewSource={mockOnViewSource}
      />,
    );

    expect(screen.getByText('No tags')).toBeInTheDocument();
  });
});
