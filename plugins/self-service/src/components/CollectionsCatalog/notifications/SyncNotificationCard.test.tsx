import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { SyncNotificationCard } from './SyncNotificationCard';
import { SyncNotification } from './types';

const theme = createTheme();

const baseNotification: SyncNotification = {
  id: 'test-1',
  title: 'Test notification',
  description: 'Test description',
  severity: 'info',
  timestamp: new Date(),
};

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('SyncNotificationCard', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and description', () => {
    renderWithTheme(
      <SyncNotificationCard
        notification={baseNotification}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText('Test notification')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('calls onClose with id when close button clicked', () => {
    renderWithTheme(
      <SyncNotificationCard
        notification={baseNotification}
        onClose={mockOnClose}
      />,
    );

    const closeButton = screen.getByRole('button', {
      name: /close notification/i,
    });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledWith('test-1');
  });

  it('renders sources list when collapsible and sources provided', () => {
    const notification: SyncNotification = {
      ...baseNotification,
      collapsible: true,
      sources: ['source1', 'source2'],
    };

    renderWithTheme(
      <SyncNotificationCard
        notification={notification}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText('source1')).toBeInTheDocument();
    expect(screen.getByText('source2')).toBeInTheDocument();
  });

  it('renders expand/collapse button when collapsible with sources', () => {
    const notification: SyncNotification = {
      ...baseNotification,
      collapsible: true,
      sources: ['source1'],
    };

    renderWithTheme(
      <SyncNotificationCard
        notification={notification}
        onClose={mockOnClose}
      />,
    );

    expect(
      screen.getByRole('button', { name: /collapse|expand/i }),
    ).toBeInTheDocument();
  });

  it('renders for different severities', () => {
    const severities: SyncNotification['severity'][] = [
      'success',
      'error',
      'warning',
    ];

    severities.forEach(severity => {
      const { unmount } = renderWithTheme(
        <SyncNotificationCard
          notification={{ ...baseNotification, severity, title: severity }}
          onClose={mockOnClose}
        />,
      );
      expect(screen.getByText(severity)).toBeInTheDocument();
      unmount();
    });
  });
});
