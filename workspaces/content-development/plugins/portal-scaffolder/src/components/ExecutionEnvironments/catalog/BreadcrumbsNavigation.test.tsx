import { render, screen, fireEvent } from '@testing-library/react';
import { BreadcrumbsNavigation } from './BreadcrumbsNavigation';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';

const theme = createMuiTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('BreadcrumbsNavigation', () => {
  const mockOnNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all breadcrumb items correctly', () => {
    renderWithTheme(
      <BreadcrumbsNavigation
        templateName="test-ee"
        onNavigateToCatalog={mockOnNavigate}
      />,
    );

    expect(
      screen.getByText('Execution environment definition files'),
    ).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('test-ee')).toBeInTheDocument();
  });

  it('displays the template name as active breadcrumb', () => {
    renderWithTheme(
      <BreadcrumbsNavigation
        templateName="my-template"
        onNavigateToCatalog={mockOnNavigate}
      />,
    );

    const activeItem = screen.getByText('my-template');
    expect(activeItem).toBeInTheDocument();
  });

  it('calls onNavigateToCatalog when Catalog link is clicked', () => {
    renderWithTheme(
      <BreadcrumbsNavigation
        templateName="test-ee"
        onNavigateToCatalog={mockOnNavigate}
      />,
    );

    const catalogLink = screen.getByText('Catalog');
    fireEvent.click(catalogLink);

    expect(mockOnNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders with empty template name without crashing', () => {
    const { container } = renderWithTheme(
      <BreadcrumbsNavigation
        templateName=""
        onNavigateToCatalog={mockOnNavigate}
      />,
    );

    // Check that breadcrumb structure exists
    const breadcrumbs = container.querySelector('nav');
    expect(breadcrumbs).toBeInTheDocument();

    // Verify other breadcrumb items are still present
    expect(
      screen.getByText('Execution environment definition files'),
    ).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    const { container } = renderWithTheme(
      <BreadcrumbsNavigation
        templateName="test-ee"
        onNavigateToCatalog={mockOnNavigate}
      />,
    );

    const breadcrumbs = container.querySelector('nav');
    expect(breadcrumbs).toBeInTheDocument();
    expect(breadcrumbs).toHaveClass('MuiBreadcrumbs-root');
  });

  it('renders template name with special characters', () => {
    renderWithTheme(
      <BreadcrumbsNavigation
        templateName="test-ee-v2.0_beta"
        onNavigateToCatalog={mockOnNavigate}
      />,
    );

    expect(screen.getByText('test-ee-v2.0_beta')).toBeInTheDocument();
  });

  it('does not navigate when root breadcrumb link is clicked', () => {
    renderWithTheme(
      <BreadcrumbsNavigation
        templateName="test-ee"
        onNavigateToCatalog={mockOnNavigate}
      />,
    );

    const rootLink = screen.getByText('Execution environment definition files');
    fireEvent.click(rootLink);

    // Should not call navigate - root link has href="#"
    expect(mockOnNavigate).not.toHaveBeenCalled();
  });
});
