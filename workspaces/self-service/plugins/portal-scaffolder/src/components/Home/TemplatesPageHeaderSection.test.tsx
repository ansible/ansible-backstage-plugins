import type { ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TemplatesPageHeaderSection } from './TemplatesPageHeaderSection';

const mockUseIsSuperuser = jest.fn().mockReturnValue({
  isSuperuser: true,
  loading: false,
  error: null,
});

// TemplatesPageHeaderSection wraps PageHeaderSection from @ansible/backstage-rhaap-react
// (via '../common'). That component calls useIsSuperuser from its own internal hooks,
// so mocking '../../hooks' alone does not intercept it. Instead, mock '../common' and
// provide a PageHeaderSection that reads from mockUseIsSuperuser directly.
// TemplatesPageHeaderSection wraps PageHeaderSection from @ansible/backstage-rhaap-react
// (via '../common'). That component imports useIsSuperuser from its own internal relative
// path inside the workspace package. Mocking '../../hooks' alone does not intercept it.
// Target the workspace package hooks directly so mockUseIsSuperuser controls all usages.
jest.mock(
  '../../../../../../portal-core/plugins/portal-plugin-sdk/src/hooks',
  () => ({
    useIsSuperuser: () => mockUseIsSuperuser(),
    clearSuperuserCache: jest.fn(),
  }),
);

const theme = createTheme();

const renderWithTheme = (ui: ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('TemplatesPageHeaderSection', () => {
  const mockOnSyncClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
  });

  it('renders Templates title', () => {
    renderWithTheme(
      <TemplatesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('renders description', () => {
    renderWithTheme(
      <TemplatesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    expect(screen.getByText(/Browse available templates/)).toBeInTheDocument();
  });

  it('renders Learn more link', () => {
    renderWithTheme(
      <TemplatesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    const link = screen.getByText('Learn more');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://red.ht/self-service-launch-template',
    );
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('renders Sync Now button when user is superuser', () => {
    renderWithTheme(
      <TemplatesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeInTheDocument();
  });

  it('calls onSyncClick when Sync Now is clicked', () => {
    renderWithTheme(
      <TemplatesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    fireEvent.click(syncButton);

    expect(mockOnSyncClick).toHaveBeenCalledTimes(1);
  });

  it('disables Sync Now when syncDisabled is true', () => {
    renderWithTheme(
      <TemplatesPageHeaderSection onSyncClick={mockOnSyncClick} syncDisabled />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
  });

  it('does not render Sync Now when user is not superuser', () => {
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: false,
      loading: false,
      error: null,
    });

    renderWithTheme(
      <TemplatesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.queryByRole('button', { name: /Sync Now/i }),
    ).not.toBeInTheDocument();
  });

  it('renders actions slot when provided', () => {
    renderWithTheme(
      <TemplatesPageHeaderSection
        onSyncClick={mockOnSyncClick}
        actions={<button data-testid="custom-action">Action</button>}
      />,
    );

    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
  });

  it('renders help icon with tooltip', () => {
    renderWithTheme(
      <TemplatesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.getByTitle(/template provides a guided experience/),
    ).toBeInTheDocument();
  });
});
