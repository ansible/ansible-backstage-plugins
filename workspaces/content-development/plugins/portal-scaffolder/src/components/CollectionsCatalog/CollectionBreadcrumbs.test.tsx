import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { CollectionBreadcrumbs } from './CollectionBreadcrumbs';

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CollectionBreadcrumbs', () => {
  const mockOnNavigateToCatalog = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Collections link and collection name', () => {
    renderWithTheme(
      <CollectionBreadcrumbs
        collectionName="my_namespace.my_collection"
        onNavigateToCatalog={mockOnNavigateToCatalog}
      />,
    );

    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.getByText('my_namespace.my_collection')).toBeInTheDocument();
  });

  it('calls onNavigateToCatalog when Collections is clicked', () => {
    renderWithTheme(
      <CollectionBreadcrumbs
        collectionName="ns.col"
        onNavigateToCatalog={mockOnNavigateToCatalog}
      />,
    );

    fireEvent.click(screen.getByText('Collections'));

    expect(mockOnNavigateToCatalog).toHaveBeenCalledTimes(1);
  });

  it('renders with empty collection name', () => {
    renderWithTheme(
      <CollectionBreadcrumbs
        collectionName=""
        onNavigateToCatalog={mockOnNavigateToCatalog}
      />,
    );

    expect(screen.getByText('Collections')).toBeInTheDocument();
  });
});
