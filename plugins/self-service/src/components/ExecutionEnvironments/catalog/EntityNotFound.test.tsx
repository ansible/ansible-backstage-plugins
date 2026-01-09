import { render, screen } from '@testing-library/react';
import { EntityNotFound } from './EntityNotFound';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';

// Mock Backstage core components
jest.mock('@backstage/core-components', () => ({
  WarningPanel: ({ title, children }: any) => (
    <div data-testid="warning-panel">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  ),
  Content: ({ children, className }: any) => (
    <div data-testid="content" className={className}>
      {children}
    </div>
  ),
}));

const theme = createMuiTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('EntityNotFound', () => {
  it('renders the warning panel with correct title', () => {
    renderWithTheme(<EntityNotFound />);

    expect(screen.getByText('Entity not found')).toBeInTheDocument();
  });

  it('displays the correct error message', () => {
    renderWithTheme(<EntityNotFound />);

    expect(
      screen.getByText(
        'There is no entity with the requested kind, namespace, and name.',
      ),
    ).toBeInTheDocument();
  });

  it('renders WarningPanel component', () => {
    renderWithTheme(<EntityNotFound />);

    const warningPanel = screen.getByTestId('warning-panel');
    expect(warningPanel).toBeInTheDocument();
  });

  it('renders Content wrapper', () => {
    renderWithTheme(<EntityNotFound />);

    const content = screen.getByTestId('content');
    expect(content).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    const { container } = renderWithTheme(<EntityNotFound />);

    expect(container.firstChild).toBeInTheDocument();
  });

  it('contains both title and message in the warning panel', () => {
    renderWithTheme(<EntityNotFound />);

    const warningPanel = screen.getByTestId('warning-panel');
    expect(warningPanel).toContainElement(screen.getByText('Entity not found'));
    expect(warningPanel).toContainElement(
      screen.getByText(
        'There is no entity with the requested kind, namespace, and name.',
      ),
    );
  });

  it('wraps the warning panel with Content component', () => {
    renderWithTheme(<EntityNotFound />);

    const content = screen.getByTestId('content');
    const warningPanel = screen.getByTestId('warning-panel');

    expect(content).toContainElement(warningPanel);
  });
});
