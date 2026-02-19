import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { SyncNotificationStack } from './SyncNotificationStack';
import { SyncNotification } from './types';

const theme = createTheme();

const createNotification = (id: string, title: string): SyncNotification => ({
  id,
  title,
  severity: 'info',
  timestamp: new Date(),
});

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('SyncNotificationStack', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when notifications array is empty', () => {
    const { container } = renderWithTheme(
      <SyncNotificationStack notifications={[]} onClose={mockOnClose} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders notifications in stack', () => {
    const notifications = [
      createNotification('1', 'First'),
      createNotification('2', 'Second'),
    ];

    renderWithTheme(
      <SyncNotificationStack
        notifications={notifications}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders stack in document body via portal', () => {
    const notifications = [createNotification('1', 'Portal content')];

    renderWithTheme(
      <SyncNotificationStack
        notifications={notifications}
        onClose={mockOnClose}
      />,
    );

    expect(document.body).toContainElement(screen.getByText('Portal content'));
  });

  it('calls onClose when a notification is closed', () => {
    const notifications = [createNotification('n1', 'Close me')];

    renderWithTheme(
      <SyncNotificationStack
        notifications={notifications}
        onClose={mockOnClose}
      />,
    );

    const closeButton = screen.getByRole('button', {
      name: /close notification/i,
    });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledWith('n1');
  });
});
