import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import {
  SyncNotificationProvider,
  useSyncNotifications,
} from './SyncNotificationContext';

const theme = createTheme();

const TestConsumer = () => {
  const {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    showSyncStarted,
    showSyncCompleted,
    showSyncFailed,
  } = useSyncNotifications();

  return (
    <div>
      <span data-testid="count">{notifications.length}</span>
      <button
        type="button"
        onClick={() =>
          addNotification({
            title: 'Test',
            description: 'Test desc',
            severity: 'info',
          })
        }
      >
        Add
      </button>
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
      <button type="button" onClick={() => showSyncStarted(['src1'])}>
        Sync started
      </button>
      <button type="button" onClick={() => showSyncCompleted('source1')}>
        Sync completed
      </button>
      <button type="button" onClick={() => showSyncFailed('source1', 'error')}>
        Sync failed
      </button>
    </div>
  );
};

const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <SyncNotificationProvider>{ui}</SyncNotificationProvider>
    </ThemeProvider>,
  );
};

describe('SyncNotificationContext', () => {
  it('provides initial empty notifications', () => {
    renderWithTheme(<TestConsumer />);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('addNotification adds a notification and returns id', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TestConsumer />);

    await user.click(screen.getByText('Add'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('removeNotification removes by id', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TestConsumer />);

    await user.click(screen.getByText('Add'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    await user.click(screen.getByText('Remove first'));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('clearAll removes all notifications', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TestConsumer />);

    await user.click(screen.getByText('Add'));
    await user.click(screen.getByText('Add'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');

    await user.click(screen.getByText('Clear all'));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('showSyncStarted adds sync-started notification', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TestConsumer />);

    await user.click(screen.getByText('Sync started'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('showSyncCompleted adds notification and removes sync-started', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TestConsumer />);

    await user.click(screen.getByText('Sync started'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    await user.click(screen.getByText('Sync completed'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('showSyncFailed adds notification', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TestConsumer />);

    await user.click(screen.getByText('Sync failed'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});

describe('useSyncNotifications', () => {
  it('throws when used outside provider', () => {
    const ConsoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(() => {
      render(
        <ThemeProvider theme={theme}>
          <TestConsumer />
        </ThemeProvider>,
      );
    }).toThrow(
      'useSyncNotifications must be used within a SyncNotificationProvider',
    );

    ConsoleSpy.mockRestore();
  });
});
