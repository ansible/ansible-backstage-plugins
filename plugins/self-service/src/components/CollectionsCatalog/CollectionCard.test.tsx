import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { Entity } from '@backstage/catalog-model';
import { CollectionCard } from './CollectionCard';

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
        syncStatusMap={{ 'src-1': '2024-06-15T10:00:00Z' }}
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
});
