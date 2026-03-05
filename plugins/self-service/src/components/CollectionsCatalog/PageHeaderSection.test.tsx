import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { PageHeaderSection } from './PageHeaderSection';

const mockUsePermission = jest.fn().mockReturnValue({ allowed: true });
jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: (...args: unknown[]) => mockUsePermission(...args),
}));

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('PageHeaderSection', () => {
  const mockOnSyncClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Collections title and description', () => {
    renderWithTheme(<PageHeaderSection onSyncClick={mockOnSyncClick} />);

    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Browse and discover Ansible collections \(modules, roles and plugins\)/,
      ),
    ).toBeInTheDocument();
  });

  it('renders Sync Now button when allowed', () => {
    renderWithTheme(<PageHeaderSection onSyncClick={mockOnSyncClick} />);

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeInTheDocument();
  });

  it('calls onSyncClick when Sync Now is clicked', () => {
    renderWithTheme(<PageHeaderSection onSyncClick={mockOnSyncClick} />);

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    fireEvent.click(syncButton);

    expect(mockOnSyncClick).toHaveBeenCalledTimes(1);
  });

  it('disables Sync Now when syncDisabled is true', () => {
    renderWithTheme(
      <PageHeaderSection onSyncClick={mockOnSyncClick} syncDisabled />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
  });

  it('renders help icon with tooltip', () => {
    renderWithTheme(<PageHeaderSection onSyncClick={mockOnSyncClick} />);

    expect(
      screen.getByTitle(/An Ansible Collection is a package of reusable/),
    ).toBeInTheDocument();
  });

  it('does not render Sync Now when permission denied', () => {
    mockUsePermission.mockReturnValueOnce({ allowed: false });

    renderWithTheme(<PageHeaderSection onSyncClick={mockOnSyncClick} />);

    expect(
      screen.queryByRole('button', { name: /Sync Now/i }),
    ).not.toBeInTheDocument();
  });

  it('shows syncDisabledReason in tooltip when sync disabled with reason', () => {
    renderWithTheme(
      <PageHeaderSection
        onSyncClick={mockOnSyncClick}
        syncDisabled
        syncDisabledReason="Sync in progress"
      />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
    expect(screen.getByTitle('Sync in progress')).toBeInTheDocument();
  });
});
