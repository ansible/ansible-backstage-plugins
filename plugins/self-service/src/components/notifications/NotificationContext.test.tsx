import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { NotificationProvider, useNotifications } from './NotificationContext';

const theme = createTheme();

const TestConsumer = ({
  showWithDismiss,
  showWithAutoHideZero,
}: {
  showWithDismiss?: boolean;
  showWithAutoHideZero?: boolean;
} = {}) => {
  const { notifications, showNotification, removeNotification, clearAll } =
    useNotifications();

  return (
    <div>
      <span data-testid="count">{notifications.length}</span>
      <button
        type="button"
        onClick={() =>
          showNotification({
            title: 'Test',
            description: 'Test description',
            severity: 'info',
          })
        }
      >
        Show
      </button>
      {showWithDismiss && (
        <button
          type="button"
          onClick={() =>
            showNotification({
              title: 'Replace',
              category: 'cat-a',
              dismissCategories: ['cat-a'],
            })
          }
        >
          Show with dismiss
        </button>
      )}
      {showWithAutoHideZero && (
        <button
          type="button"
          onClick={() =>
            showNotification({
              title: 'Error',
              severity: 'error',
              autoHideDuration: 0,
            })
          }
        >
          Show error
        </button>
      )}
      <button
        type="button"
        onClick={() =>
          notifications.length > 0 && removeNotification(notifications[0].id)
        }
      >
        Remove first
      </button>
      <button type="button" onClick={clearAll}>
        Clear all
      </button>
    </div>
  );
};

const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <NotificationProvider>{ui}</NotificationProvider>
    </ThemeProvider>,
  );
};

describe('NotificationProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders children and provides initial empty notifications', () => {
    renderWithTheme(<TestConsumer />);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('showNotification adds a notification and returns id', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TestConsumer />);

    await user.click(screen.getByText('Show'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('showNotification uses default severity info when not provided', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TestConsumer />);

    await user.click(screen.getByText('Show'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('removeNotification removes notification after exit animation', () => {
    jest.useFakeTimers();
    renderWithTheme(<TestConsumer />);

    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    fireEvent.click(screen.getByText('Remove first'));
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    jest.useRealTimers();
  });

  it('clearAll removes all notifications', async () => {
    renderWithTheme(<TestConsumer />);

    await userEvent.click(screen.getByText('Show'));
    await userEvent.click(screen.getByText('Show'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');

    await userEvent.click(screen.getByText('Clear all'));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('showNotification with dismissCategories removes previous notifications of that category', () => {
    jest.useFakeTimers();
    renderWithTheme(<TestConsumer showWithDismiss />);

    fireEvent.click(screen.getByText('Show with dismiss'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    fireEvent.click(screen.getByText('Show with dismiss'));
    expect(screen.getByTestId('count')).toHaveTextContent('3');
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    jest.useRealTimers();
  });

  it('showNotification with autoHideDuration 0 does not auto-remove', () => {
    jest.useFakeTimers();
    renderWithTheme(<TestConsumer showWithAutoHideZero />);

    fireEvent.click(screen.getByText('Show error'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    jest.useRealTimers();
  });
});

describe('useNotifications', () => {
  it('throws when used outside NotificationProvider', () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(() => {
      render(
        <ThemeProvider theme={theme}>
          <TestConsumer />
        </ThemeProvider>,
      );
    }).toThrow('useNotifications must be used within a NotificationProvider');

    consoleSpy.mockRestore();
  });
});
