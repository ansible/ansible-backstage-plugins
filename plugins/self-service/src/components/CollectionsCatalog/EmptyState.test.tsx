import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { EmptyState } from './EmptyState';

const mockUsePermission = jest.fn().mockReturnValue({ allowed: true });
jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: (...args: unknown[]) => mockUsePermission(...args),
}));

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('EmptyState', () => {
  const mockOnSyncClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders Sync Now button when allowed and onSyncClick provided and sources configured', () => {
    renderWithTheme(
      <EmptyState hasConfiguredSources onSyncClick={mockOnSyncClick} />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeInTheDocument();

    fireEvent.click(syncButton);
    expect(mockOnSyncClick).toHaveBeenCalledTimes(1);
  });

  it('renders View Documentation link when hasConfiguredSources is false and allowed', () => {
    renderWithTheme(
      <EmptyState hasConfiguredSources={false} onSyncClick={mockOnSyncClick} />,
    );

    expect(screen.getByText('View Documentation')).toBeInTheDocument();
  });

  it('shows admin message when allowed is false and hasConfiguredSources is false', () => {
    mockUsePermission.mockReturnValueOnce({ allowed: false });

    renderWithTheme(
      <EmptyState hasConfiguredSources={false} onSyncClick={mockOnSyncClick} />,
    );

    expect(
      screen.getByText(/Content sources are not currently configured/),
    ).toBeInTheDocument();
    expect(screen.queryByText('View Documentation')).not.toBeInTheDocument();
  });

  it('shows admin message and no Sync when allowed is false and sources configured', () => {
    mockUsePermission.mockReturnValueOnce({ allowed: false });

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
});
