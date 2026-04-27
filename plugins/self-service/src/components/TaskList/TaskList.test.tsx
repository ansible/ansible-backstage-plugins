import { TaskList, HistoryRoutesPage } from './TaskList';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import {
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { mockScaffolderApi } from '../../tests/scaffolderApi_utils';
import { rootRouteRef } from '../../routes';

jest.mock('@backstage/plugin-permission-react', () => ({
  RequirePermission: (props: any) => props.children,
}));

const mockRemoveNotification = jest.fn();
const mockNotifications = [
  {
    id: 'n1',
    title: 'Test notification',
    severity: 'success' as const,
    timestamp: new Date(),
  },
];

jest.mock('../notifications', () => ({
  NotificationProvider: ({ children }: any) => <>{children}</>,
  NotificationStack: ({
    notifications,
    onClose,
  }: {
    notifications: Array<{ id: string; title: string }>;
    onClose: (id: string) => void;
  }) => (
    <div data-testid="notification-stack">
      {notifications.map((n: any) => (
        <div key={n.id} data-testid={`notification-${n.id}`}>
          {n.title}
          <button onClick={() => onClose(n.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  ),
  useNotifications: () => ({
    notifications: mockNotifications,
    removeNotification: mockRemoveNotification,
    showNotification: jest.fn(),
    clearAll: jest.fn(),
  }),
}));

describe('My items', () => {
  const server = setupServer();
  // Enable sane handlers for network requests
  registerMswTestHooks(server);

  // setup mock response
  beforeEach(() => {
    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider apis={[[scaffolderApiRef, mockScaffolderApi]]}>
        <>{children}</>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  it('should render', async () => {
    await render(<TaskList />);
    expect(screen.getByText('Task List')).toBeInTheDocument();
    expect(
      screen.getByText(
        'View all your past tasks launched from self-service automation portal.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Task ID' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Template' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Created at' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Owner' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Status' }),
    ).toBeInTheDocument();
  });
});

describe('HistoryRoutesPage notifications', () => {
  const server = setupServer();
  registerMswTestHooks(server);

  beforeEach(() => {
    jest.clearAllMocks();
    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
  });

  const renderPage = () => {
    return renderInTestApp(
      <TestApiProvider apis={[[scaffolderApiRef, mockScaffolderApi]]}>
        <HistoryRoutesPage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  it('renders NotificationStack with notifications', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('notification-stack')).toBeInTheDocument();
    });
    expect(screen.getByTestId('notification-n1')).toBeInTheDocument();
    expect(screen.getByText('Test notification')).toBeInTheDocument();
  });

  it('calls removeNotification when dismiss is clicked', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('notification-stack')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dismiss'));
    expect(mockRemoveNotification).toHaveBeenCalledWith('n1');
  });
});
