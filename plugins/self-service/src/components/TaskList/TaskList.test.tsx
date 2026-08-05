import { TaskList, HistoryRoutesPage } from './TaskList';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import {
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { mockScaffolderApi } from '../../tests/scaffolderApi_utils';
import { rootRouteRef } from '../../routes';
import { identityApiRef } from '@backstage/core-plugin-api';

const mockIdentityApi = {
  getBackstageIdentity: jest.fn().mockResolvedValue({
    type: 'user',
    userEntityRef: 'user:default/test-user',
    ownershipEntityRefs: ['user:default/test-user'],
  }),
  getCredentials: jest.fn().mockResolvedValue({ token: 'test-token' }),
  getProfileInfo: jest.fn().mockResolvedValue({
    email: 'test@example.com',
    displayName: 'Test User',
  }),
};

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
    jest.restoreAllMocks();
    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      type: 'user',
      userEntityRef: 'user:default/test-user',
      ownershipEntityRefs: ['user:default/test-user'],
    });
  });

  const render = (
    children: JSX.Element,
    overrides?: {
      scaffolderApi?: any;
      identityApi?: any;
    },
  ) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, overrides?.scaffolderApi ?? mockScaffolderApi],
          [identityApiRef, overrides?.identityApi ?? mockIdentityApi],
        ]}
      >
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

  it('renders error when listTasks is not available', async () => {
    const noListTasksApi = {
      getTemplateParameterSchema: jest.fn(),
    };
    await render(<TaskList />, { scaffolderApi: noListTasksApi });
    await waitFor(() => {
      expect(
        screen.getByText(/listTasks method is not available on scaffolderApi/),
      ).toBeInTheDocument();
    });
  });

  it('renders error when listTasks API call fails', async () => {
    const failingApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockRejectedValue(new Error('Network error')),
    };
    await render(<TaskList />, { scaffolderApi: failingApi });
    await waitFor(() => {
      expect(screen.getByText(/Error: Network error/)).toBeInTheDocument();
    });
  });

  it('shows Untitled for tasks with missing template title', async () => {
    const apiWithUntitled = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue({
        tasks: [
          {
            id: 'task-no-title',
            spec: {
              templateInfo: {
                entity: {
                  metadata: { name: 'unnamed-template', namespace: 'default' },
                },
              },
              user: {
                entity: { metadata: { title: 'Some User' } },
              },
            },
            status: 'completed',
            createdAt: '2024-12-14T10:00:00.000Z',
          },
        ],
        totalTasks: '1',
      }),
    };
    await render(<TaskList />, { scaffolderApi: apiWithUntitled });
    await waitFor(() => {
      expect(screen.getByText('Untitled')).toBeInTheDocument();
    });
  });

  it('renders task rows with different status values', async () => {
    const apiWithStatuses = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue({
        tasks: [
          {
            id: 'task-processing',
            spec: {
              templateInfo: {
                entity: {
                  metadata: {
                    name: 't1',
                    namespace: 'default',
                    title: 'Processing task',
                  },
                },
              },
              user: { entity: { metadata: { title: 'User A' } } },
            },
            status: 'processing',
            createdAt: '2024-12-14T10:00:00.000Z',
          },
          {
            id: 'task-open',
            spec: {
              templateInfo: {
                entity: {
                  metadata: {
                    name: 't2',
                    namespace: 'default',
                    title: 'Open task',
                  },
                },
              },
              user: { entity: { metadata: { title: 'User B' } } },
            },
            status: 'open',
            createdAt: '2024-12-14T11:00:00.000Z',
          },
          {
            id: 'task-cancelled',
            spec: {
              templateInfo: {
                entity: {
                  metadata: {
                    name: 't3',
                    namespace: 'default',
                    title: 'Cancelled task',
                  },
                },
              },
              user: { entity: { metadata: { title: 'User C' } } },
            },
            status: 'cancelled',
            createdAt: '2024-12-14T12:00:00.000Z',
          },
        ],
        totalTasks: '3',
      }),
    };
    await render(<TaskList />, { scaffolderApi: apiWithStatuses });
    await waitFor(() => {
      expect(screen.getByText('processing')).toBeInTheDocument();
    });
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('cancelled')).toBeInTheDocument();
  });

  it('uses filterByOwnership=all when user is in admins group', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      type: 'user',
      userEntityRef: 'user:default/admin-user',
      ownershipEntityRefs: ['user:default/admin-user', 'group:default/admins'],
    });
    const listTasksSpy = jest.fn().mockResolvedValue({
      tasks: [],
      totalTasks: '0',
    });
    const adminApi = {
      ...mockScaffolderApi,
      listTasks: listTasksSpy,
    };
    await render(<TaskList />, { scaffolderApi: adminApi });
    await waitFor(() => {
      expect(listTasksSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filterByOwnership: 'all',
        }),
      );
    });
  });

  it('renders task with unknown status showing default empty icon', async () => {
    const apiWithUnknown = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue({
        tasks: [
          {
            id: 'task-unknown',
            spec: {
              templateInfo: {
                entity: {
                  metadata: {
                    name: 't1',
                    namespace: 'default',
                    title: 'Unknown status task',
                  },
                },
              },
              user: { entity: { metadata: { title: 'User' } } },
            },
            status: 'some-unknown-status',
            createdAt: '2024-12-14T10:00:00.000Z',
          },
        ],
        totalTasks: '1',
      }),
    };
    await render(<TaskList />, { scaffolderApi: apiWithUnknown });
    await waitFor(() => {
      expect(screen.getByText('some-unknown-status')).toBeInTheDocument();
    });
  });

  it('renders empty state when no tasks are returned', async () => {
    const emptyApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue({
        tasks: [],
        totalTasks: '0',
      }),
    };
    await render(<TaskList />, { scaffolderApi: emptyApi });
    await waitFor(() => {
      expect(screen.getByText('No tasks found')).toBeInTheDocument();
    });
  });

  it('handles undefined totalTasks in API response', async () => {
    const apiNoTotal = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue({
        tasks: [],
        totalTasks: undefined,
      }),
    };
    await render(<TaskList />, { scaffolderApi: apiNoTotal });
    await waitFor(() => {
      expect(screen.getByText('No tasks found')).toBeInTheDocument();
    });
  });

  it('handles task with missing template name by not navigating', async () => {
    const apiNoName = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue({
        tasks: [
          {
            id: 'task-no-name',
            spec: {
              templateInfo: {
                entity: { metadata: {} },
              },
              user: { entity: { metadata: { title: 'User' } } },
            },
            status: 'completed',
            createdAt: '2024-12-14T10:00:00.000Z',
          },
        ],
        totalTasks: '1',
      }),
    };
    await render(<TaskList />, { scaffolderApi: apiNoName });
    await waitFor(() => {
      expect(screen.getByText('Untitled')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Untitled'));
  });

  it('renders with dark theme styles', async () => {
    const darkTheme = createMuiTheme({ palette: { type: 'dark' } });

    await renderInTestApp(
      <ThemeProvider theme={darkTheme}>
        <TestApiProvider
          apis={[
            [scaffolderApiRef, mockScaffolderApi],
            [identityApiRef, mockIdentityApi],
          ]}
        >
          <TaskList />
        </TestApiProvider>
      </ThemeProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('Task List')).toBeInTheDocument();
    });
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
