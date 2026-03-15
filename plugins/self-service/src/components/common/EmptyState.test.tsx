import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { EmptyState } from './EmptyState';

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

describe('EmptyState', () => {
  const mockOnSyncClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
  });

  it('shows "No content sources configured" when hasConfiguredSources is false', () => {
    renderWithTheme(
      <EmptyState hasConfiguredSources={false} onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.getByText('No content sources configured'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /No content sources are not defined|Content sources are not currently configured/,
      ),
    ).toBeInTheDocument();
  });

  it('shows "No Collections Found" when hasConfiguredSources is true and no collections', () => {
    renderWithTheme(
      <EmptyState hasConfiguredSources onSyncClick={mockOnSyncClick} />,
    );

    expect(screen.getByText('No Collections Found')).toBeInTheDocument();
    expect(
      screen.getByText(
        /No collections were retrieved|No collections are available/,
      ),
    ).toBeInTheDocument();
  });

  it('shows "No Collections Found" when hasConfiguredSources is null (default)', () => {
    renderWithTheme(<EmptyState onSyncClick={mockOnSyncClick} />);

    expect(screen.getByText('No Collections Found')).toBeInTheDocument();
  });

  it('renders Sync Now button when superuser and onSyncClick provided and sources configured', () => {
    renderWithTheme(
      <EmptyState hasConfiguredSources onSyncClick={mockOnSyncClick} />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeInTheDocument();

    fireEvent.click(syncButton);
    expect(mockOnSyncClick).toHaveBeenCalledTimes(1);
  });

  it('renders View Documentation link when hasConfiguredSources is false and superuser', () => {
    renderWithTheme(
      <EmptyState hasConfiguredSources={false} onSyncClick={mockOnSyncClick} />,
    );

    expect(screen.getByText('View Documentation')).toBeInTheDocument();
  });

  it('shows admin message when user is not superuser and hasConfiguredSources is false', () => {
    mockUseIsSuperuser.mockReturnValueOnce({
      isSuperuser: false,
      loading: false,
      error: null,
    });

    renderWithTheme(
      <EmptyState hasConfiguredSources={false} onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.getByText(/Content sources are not currently configured/),
    ).toBeInTheDocument();
    expect(screen.queryByText('View Documentation')).not.toBeInTheDocument();
  });

  it('shows admin message and no Sync when user is not superuser and sources configured', () => {
    mockUseIsSuperuser.mockReturnValueOnce({
      isSuperuser: false,
      loading: false,
      error: null,
    });

    renderWithTheme(
      <EmptyState hasConfiguredSources onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.getByText(/No collections are available in the catalog/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Sync Now/i }),
    ).not.toBeInTheDocument();
  });

  it('shows repository filter message when repositoryFilter is true', () => {
    renderWithTheme(
      <EmptyState repositoryFilter onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.getByText('No collections discovered from this repository'),
    ).toBeInTheDocument();
  });

  it('disables Sync Now button when syncDisabled is true', () => {
    renderWithTheme(
      <EmptyState
        hasConfiguredSources
        onSyncClick={mockOnSyncClick}
        syncDisabled
      />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
  });

  it('shows syncDisabledReason in tooltip when sync is disabled', () => {
    renderWithTheme(
      <EmptyState
        hasConfiguredSources
        onSyncClick={mockOnSyncClick}
        syncDisabled
        syncDisabledReason="Custom reason"
      />,
    );

    expect(screen.getByTitle('Custom reason')).toBeInTheDocument();
  });
});
