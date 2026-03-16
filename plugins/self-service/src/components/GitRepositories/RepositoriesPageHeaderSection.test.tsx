import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { RepositoriesPageHeaderSection } from './RepositoriesPageHeaderSection';

const mockUseIsSuperuser = jest.fn().mockReturnValue({
  isSuperuser: true,
  loading: false,
  error: null,
});
jest.mock('../../hooks', () => ({
  useIsSuperuser: () => mockUseIsSuperuser(),
}));

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('RepositoriesPageHeaderSection', () => {
  const mockOnSyncClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
  });

  it('renders Git Repositories title', () => {
    renderWithTheme(
      <RepositoriesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    expect(screen.getByText('Git Repositories')).toBeInTheDocument();
  });

  it('renders description', () => {
    renderWithTheme(
      <RepositoriesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.getByText(/Browse Git repositories from your connected/),
    ).toBeInTheDocument();
  });

  it('renders Sync Now button when user is superuser', () => {
    renderWithTheme(
      <RepositoriesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeInTheDocument();
  });

  it('calls onSyncClick when Sync Now is clicked', () => {
    renderWithTheme(
      <RepositoriesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    fireEvent.click(syncButton);

    expect(mockOnSyncClick).toHaveBeenCalledTimes(1);
  });

  it('disables Sync Now when syncDisabled is true', () => {
    renderWithTheme(
      <RepositoriesPageHeaderSection
        onSyncClick={mockOnSyncClick}
        syncDisabled
      />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
  });

  it('renders help icon with tooltip', () => {
    renderWithTheme(
      <RepositoriesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.getByTitle(/Git repositories discovered from your configured/),
    ).toBeInTheDocument();
  });

  it('does not render Sync Now when user is not superuser', () => {
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: false,
      loading: false,
      error: null,
    });

    renderWithTheme(
      <RepositoriesPageHeaderSection onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.queryByRole('button', { name: /Sync Now/i }),
    ).not.toBeInTheDocument();
  });

  it('shows syncDisabledReason in tooltip when sync disabled with reason', () => {
    renderWithTheme(
      <RepositoriesPageHeaderSection
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
