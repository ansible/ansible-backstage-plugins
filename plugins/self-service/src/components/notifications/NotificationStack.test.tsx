import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { NotificationStack } from './NotificationStack';
import type { Notification } from './types';

const theme = createTheme();

const createNotification = (
  overrides: Partial<Notification> = {},
): Notification => ({
  id: 'notif-1',
  title: 'Test notification',
  severity: 'info',
  timestamp: new Date(),
  ...overrides,
});

const renderWithTheme = (
  notifications: Notification[],
  onClose: (id: string) => void,
) => {
  return render(
    <ThemeProvider theme={theme}>
      <NotificationStack notifications={notifications} onClose={onClose} />
    </ThemeProvider>,
  );
};

describe('NotificationStack', () => {
  it('returns null when notifications array is empty', () => {
    const { container } = renderWithTheme([], () => {});

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing in the default container when empty', () => {
    const { container } = renderWithTheme([], () => {});

    expect(container.querySelector('.MuiBox-root')).not.toBeInTheDocument();
  });

  it('renders NotificationCards when notifications are provided', () => {
    const notifications = [
      createNotification({ id: 'a', title: 'First' }),
      createNotification({ id: 'b', title: 'Second' }),
    ];
    renderWithTheme(notifications, () => {});

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('portals content to document.body', () => {
    const notifications = [createNotification({ id: 'a', title: 'Portaled' })];
    renderWithTheme(notifications, () => {});

    const inBody = document.body.querySelector('[class*="stack"]');
    expect(inBody).toBeInTheDocument();
    expect(document.body).toHaveTextContent('Portaled');
  });

  it('calls onClose with correct id when a card close button is clicked', async () => {
    const onClose = jest.fn();
    const notifications = [
      createNotification({ id: 'notif-123', title: 'Close me' }),
    ];
    renderWithTheme(notifications, onClose);

    const closeButtons = screen.getAllByLabelText('Close notification');
    await userEvent.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalledWith('notif-123');
  });
});
