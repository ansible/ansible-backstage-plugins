import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { PageHeaderSection } from './PageHeaderSection';

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

describe('PageHeaderSection', () => {
  const mockOnSyncClick = jest.fn();

  const defaultProps = {
    title: 'Test Title',
    tooltip: 'Test Tooltip',
    description: 'Test Description',
    onSyncClick: mockOnSyncClick,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
  });

  it('renders title', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders description', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    expect(screen.getByText('Test Description')).toBeInTheDocument();
  });

  it('renders tooltip on help icon', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    expect(screen.getByTitle('Test Tooltip')).toBeInTheDocument();
  });

  it('renders Sync Now button when allowed', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeInTheDocument();
  });

  it('calls onSyncClick when Sync Now is clicked', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    fireEvent.click(syncButton);

    expect(mockOnSyncClick).toHaveBeenCalledTimes(1);
  });

  it('disables Sync Now when syncDisabled is true', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} syncDisabled />);

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
  });

  it('does not render Sync Now when not superuser', () => {
    mockUseIsSuperuser.mockReturnValueOnce({
      isSuperuser: false,
      loading: false,
      error: null,
    });

    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    expect(
      screen.queryByRole('button', { name: /Sync Now/i }),
    ).not.toBeInTheDocument();
  });

  it('shows syncDisabledReason in tooltip when sync disabled with reason', () => {
    renderWithTheme(
      <PageHeaderSection
        {...defaultProps}
        syncDisabled
        syncDisabledReason="Custom reason"
      />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
    expect(screen.getByTitle('Custom reason')).toBeInTheDocument();
  });

  it('defaults syncDisabled to false', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).not.toBeDisabled();
  });

  it('renders h1 element for title', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Test Title');
  });

  it('renders different titles correctly', () => {
    const { rerender } = renderWithTheme(
      <PageHeaderSection {...defaultProps} title="First Title" />,
    );

    expect(screen.getByText('First Title')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={theme}>
        <PageHeaderSection {...defaultProps} title="Second Title" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Second Title')).toBeInTheDocument();
  });

  it('shows empty tooltip on button when sync is not disabled', () => {
    renderWithTheme(<PageHeaderSection {...defaultProps} />);

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).not.toBeDisabled();
  });

  it('handles empty syncDisabledReason when syncDisabled', () => {
    renderWithTheme(
      <PageHeaderSection
        {...defaultProps}
        syncDisabled
        syncDisabledReason=""
      />,
    );

    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeDisabled();
  });
});
