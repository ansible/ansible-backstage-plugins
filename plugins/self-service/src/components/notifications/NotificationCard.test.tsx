import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { NotificationCard } from './NotificationCard';
import type { Notification } from './types';

const theme = createTheme();

const baseNotification: Notification = {
  id: 'notif-1',
  title: 'Test title',
  severity: 'info',
  timestamp: new Date(),
};

const renderWithTheme = (
  notification: Notification,
  onClose: (id: string) => void,
) => {
  return render(
    <ThemeProvider theme={theme}>
      <NotificationCard notification={notification} onClose={onClose} />
    </ThemeProvider>,
  );
};

describe('NotificationCard', () => {
  it('renders title', () => {
    renderWithTheme(baseNotification, () => {});
    expect(screen.getByText('Test title')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    renderWithTheme(
      { ...baseNotification, description: 'Test description' },
      () => {},
    );
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    renderWithTheme(baseNotification, () => {});
    expect(screen.queryByText('Test description')).not.toBeInTheDocument();
  });

  it('calls onClose with notification id when close button is clicked', async () => {
    const onClose = jest.fn();
    renderWithTheme(baseNotification, onClose);

    await userEvent.click(screen.getByLabelText('Close notification'));

    expect(onClose).toHaveBeenCalledWith('notif-1');
  });

  it('renders expand/collapse button when collapsible with items', () => {
    renderWithTheme(
      {
        ...baseNotification,
        collapsible: true,
        items: ['Item 1', 'Item 2'],
      },
      () => {},
    );
    expect(screen.getByLabelText('Collapse')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('toggles expand/collapse when button is clicked', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      {
        ...baseNotification,
        collapsible: true,
        items: ['Item 1'],
      },
      () => {},
    );

    await user.click(screen.getByLabelText('Collapse'));
    expect(screen.getByLabelText('Expand')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Expand'));
    expect(screen.getByLabelText('Collapse')).toBeInTheDocument();
  });

  it('renders without expand button when not collapsible', () => {
    renderWithTheme({ ...baseNotification, items: ['Item 1'] }, () => {});
    expect(screen.queryByLabelText('Collapse')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Expand')).not.toBeInTheDocument();
  });

  it('renders without expand button when items are empty', () => {
    renderWithTheme(
      { ...baseNotification, collapsible: true, items: [] },
      () => {},
    );
    expect(screen.queryByLabelText('Collapse')).not.toBeInTheDocument();
  });

  it('renders for severity success', () => {
    renderWithTheme({ ...baseNotification, severity: 'success' }, () => {});
    expect(screen.getByText('Test title')).toBeInTheDocument();
  });

  it('renders for severity error', () => {
    renderWithTheme({ ...baseNotification, severity: 'error' }, () => {});
    expect(screen.getByText('Test title')).toBeInTheDocument();
  });

  it('renders for severity warning', () => {
    renderWithTheme({ ...baseNotification, severity: 'warning' }, () => {});
    expect(screen.getByText('Test title')).toBeInTheDocument();
  });

  it('renders when isExiting is true', () => {
    renderWithTheme({ ...baseNotification, isExiting: true }, () => {});
    expect(screen.getByText('Test title')).toBeInTheDocument();
  });
});
