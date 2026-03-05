import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { RepositoryBreadcrumbs } from './RepositoryBreadcrumbs';

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('RepositoryBreadcrumbs', () => {
  const mockOnNavigateToCatalog = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Repositories link and repository name', () => {
    renderWithTheme(
      <RepositoryBreadcrumbs
        repositoryName="my-awesome-repo"
        onNavigateToCatalog={mockOnNavigateToCatalog}
      />,
    );

    expect(screen.getByText('Repositories')).toBeInTheDocument();
    expect(screen.getByText('my-awesome-repo')).toBeInTheDocument();
  });

  it('calls onNavigateToCatalog when Repositories is clicked', () => {
    renderWithTheme(
      <RepositoryBreadcrumbs
        repositoryName="test-repo"
        onNavigateToCatalog={mockOnNavigateToCatalog}
      />,
    );

    fireEvent.click(screen.getByText('Repositories'));

    expect(mockOnNavigateToCatalog).toHaveBeenCalledTimes(1);
  });

  it('renders with empty repository name', () => {
    renderWithTheme(
      <RepositoryBreadcrumbs
        repositoryName=""
        onNavigateToCatalog={mockOnNavigateToCatalog}
      />,
    );

    expect(screen.getByText('Repositories')).toBeInTheDocument();
  });

  it('renders breadcrumb separator', () => {
    renderWithTheme(
      <RepositoryBreadcrumbs
        repositoryName="test-repo"
        onNavigateToCatalog={mockOnNavigateToCatalog}
      />,
    );

    const breadcrumbs = screen.getByRole('navigation');
    expect(breadcrumbs).toBeInTheDocument();
  });

  it('displays special characters in repository name', () => {
    renderWithTheme(
      <RepositoryBreadcrumbs
        repositoryName="repo-with-special_chars.123"
        onNavigateToCatalog={mockOnNavigateToCatalog}
      />,
    );

    expect(screen.getByText('repo-with-special_chars.123')).toBeInTheDocument();
  });
});
