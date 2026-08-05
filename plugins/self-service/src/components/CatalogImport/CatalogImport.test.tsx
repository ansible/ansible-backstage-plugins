import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { CatalogImport } from './CatalogImport';
import '@testing-library/jest-dom';

// Mock Backstage components
jest.mock('@backstage/core-components', () => ({
  Page: ({ children }: any) => <div data-testid="page">{children}</div>,
  Header: ({ title, subtitle }: any) => (
    <div>
      <div data-testid="header-title">{title}</div>
      <div data-testid="header-subtitle">{subtitle}</div>
    </div>
  ),
  Content: ({ children }: any) => <div data-testid="content">{children}</div>,
  InfoCard: ({ title, children }: any) => (
    <div data-testid="info-card">
      <div>{title}</div>
      {children}
    </div>
  ),
}));

// Mock ImportStepper
jest.mock('@backstage/plugin-catalog-import', () => ({
  ImportStepper: () => <div data-testid="import-stepper" />,
}));

describe('CatalogImport', () => {
  it('renders the CatalogImport page and its main sections', () => {
    render(<CatalogImport />);

    expect(screen.getByTestId('page')).toBeInTheDocument();
    expect(screen.getByTestId('header-title')).toHaveTextContent(
      'Add Template',
    );
    expect(screen.getByTestId('header-subtitle')).toHaveTextContent(
      'Add a new template to the catalog',
    );
    expect(screen.getByTestId('info-card')).toBeInTheDocument();
    expect(screen.getByTestId('import-stepper')).toBeInTheDocument();
  });

  it('renders correctly with dark theme', () => {
    const darkTheme = createTheme({ palette: { type: 'dark' } });
    render(
      <ThemeProvider theme={darkTheme}>
        <CatalogImport />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('header-title')).toHaveTextContent(
      'Add Template',
    );
    expect(screen.getByTestId('header-subtitle')).toHaveTextContent(
      'Add a new template to the catalog',
    );
  });
});
