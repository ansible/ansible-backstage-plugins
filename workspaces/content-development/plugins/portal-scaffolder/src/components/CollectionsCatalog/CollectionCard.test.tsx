import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { Entity } from '@backstage/catalog-model';
import { CollectionCard } from './CollectionCard';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

const theme = createTheme();

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-namespace-my-collection',
    annotations: {
      'ansible.io/collection-source': 'pah',
      'ansible.io/collection-source-repository': 'repo1',
      'ansible.io/discovery-source-id': 'src-1',
    },
  },
  spec: {
    type: 'ansible-collection',
    collection_full_name: 'my_namespace.my_collection',
    collection_namespace: 'my_namespace',
    collection_name: 'my_collection',
    collection_version: '1.2.3',
  } as any,
};

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CollectionCard', () => {
  const mockOnClick = jest.fn();
  const mockOnToggleStar = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders collection full name and version', () => {
    renderWithTheme(
      <CollectionCard
        entity={mockEntity}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    expect(screen.getByText('my_namespace.my_collection')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('renders source label and last sync', () => {
    renderWithTheme(
      <CollectionCard
        entity={mockEntity}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{
          'src-1': {
            lastSyncTime: '2024-06-15T10:00:00Z',
            lastFailedSyncTime: null,
          },
        }}
      />,
    );

    expect(screen.getByText(/Source:/)).toBeInTheDocument();
    expect(screen.getByText(/Last Sync:/)).toBeInTheDocument();
  });

  it('calls onClick with collection path when card is clicked', () => {
    renderWithTheme(
      <CollectionCard
        entity={mockEntity}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    const card = screen
      .getByText('my_namespace.my_collection')
      .closest('.MuiCard-root');
    expect(card).toBeInTheDocument();
    fireEvent.click(card!);

    expect(mockOnClick).toHaveBeenCalledWith(
      '/self-service/collections/my-namespace-my-collection',
    );
  });

  it('shows filled star when isStarred is true', () => {
    renderWithTheme(
      <CollectionCard
        entity={mockEntity}
        onClick={mockOnClick}
        isStarred
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    const starButton = screen.getByRole('button', {
      name: /remove from favorites/i,
    });
    expect(starButton).toBeInTheDocument();
  });

  it('shows empty star when isStarred is false', () => {
    renderWithTheme(
      <CollectionCard
        entity={mockEntity}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    const starButton = screen.getByRole('button', {
      name: /add to favorites/i,
    });
    expect(starButton).toBeInTheDocument();
  });

  it('calls onToggleStar when star button is clicked', () => {
    renderWithTheme(
      <CollectionCard
        entity={mockEntity}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    const starButton = screen.getByRole('button', {
      name: /add to favorites/i,
    });
    fireEvent.click(starButton);

    expect(mockOnToggleStar).toHaveBeenCalledWith(mockEntity);
  });

  it('displays N/A for version when not in spec', () => {
    const entityNoVersion: Entity = {
      ...mockEntity,
      spec: {
        ...mockEntity.spec,
        collection_version: undefined,
      } as any,
    };

    renderWithTheme(
      <CollectionCard
        entity={entityNoVersion}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('falls back to namespace.name when collection_full_name is empty', () => {
    const entityNoFullName: Entity = {
      ...mockEntity,
      spec: {
        ...mockEntity.spec,
        collection_full_name: '',
      } as any,
    };

    renderWithTheme(
      <CollectionCard
        entity={entityNoFullName}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    expect(screen.getByText('my_namespace.my_collection')).toBeInTheDocument();
  });

  it('renders Never Synced when no sync status exists for the source', () => {
    const entityNoSource: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {},
      },
    };

    renderWithTheme(
      <CollectionCard
        entity={entityNoSource}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    expect(
      screen.getByText(
        (content, el) =>
          el?.textContent === 'Last Sync: Never Synced' ||
          content.includes('Never Synced'),
      ),
    ).toBeInTheDocument();
  });

  it('renders source as link when sourceUrl exists', () => {
    const entityWithSourceUrl: Entity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          ...mockEntity.metadata.annotations,
          'backstage.io/source-url': 'https://hub.example.com/repo1',
        },
      },
    };

    renderWithTheme(
      <CollectionCard
        entity={entityWithSourceUrl}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    const sourceLink = screen.getByText('Private Automation Hub (repo1)');
    expect(sourceLink.closest('a')).toHaveAttribute(
      'href',
      'https://hub.example.com/repo1',
    );
  });

  it('handles entity with undefined spec', () => {
    const entityNoSpec = {
      ...mockEntity,
      spec: undefined,
    } as unknown as Entity;

    renderWithTheme(
      <CollectionCard
        entity={entityNoSpec}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('handles non-string collection_namespace and collection_name', () => {
    const entityBadSpec: Entity = {
      ...mockEntity,
      spec: {
        ...mockEntity.spec,
        collection_namespace: 123 as any,
        collection_name: null as any,
        collection_full_name: '',
      } as any,
    };

    renderWithTheme(
      <CollectionCard
        entity={entityBadSpec}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{}}
      />,
    );

    expect(screen.getByText('.')).toBeInTheDocument();
  });

  it('displays Not Available for last sync when sync failed and no last sync time', () => {
    renderWithTheme(
      <CollectionCard
        entity={mockEntity}
        onClick={mockOnClick}
        isStarred={false}
        onToggleStar={mockOnToggleStar}
        syncStatusMap={{
          'src-1': {
            lastSyncTime: null,
            lastFailedSyncTime: '2024-06-14T10:00:00Z',
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        (content, el) =>
          el?.textContent === 'Last Sync: Not Available' ||
          content.includes('Not Available'),
      ),
    ).toBeInTheDocument();
  });
});
