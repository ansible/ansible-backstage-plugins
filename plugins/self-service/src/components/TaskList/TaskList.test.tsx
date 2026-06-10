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
import { discoveryApiRef, identityApiRef } from '@backstage/core-plugin-api';

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

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
    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockScaffolderApi],
          [discoveryApiRef, mockDiscoveryApi],
          [identityApiRef, mockIdentityApi],
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
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockScaffolderApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
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

describe('TaskList AAP job status integration', () => {
  const server = setupServer();
  registerMswTestHooks(server);

  const mockTasksWithJobs = {
    tasks: [
      {
        id: 'task-1',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        spec: {
          templateInfo: {
            entity: {
              metadata: {
                name: 'test-template',
                title: 'Test Template',
                namespace: 'default',
              },
            },
          },
          user: {
            entity: {
              metadata: {
                title: 'Test User',
              },
            },
          },
        },
        output: {
          data: {
            id: 123,
          },
        },
      },
      {
        id: 'task-2',
        status: 'failed',
        createdAt: '2024-01-02T00:00:00Z',
        spec: {
          templateInfo: {
            entity: {
              metadata: {
                name: 'test-template-2',
                title: 'Test Template 2',
                namespace: 'default',
              },
            },
          },
          user: {
            entity: {
              metadata: {
                title: 'Test User',
              },
            },
          },
        },
        output: {
          data: {
            id: 456,
          },
        },
      },
    ],
    totalTasks: 2,
  };

  const mockScaffolderApiWithJobs = {
    ...mockScaffolderApi,
    listTasks: jest.fn().mockResolvedValue(mockTasksWithJobs),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoveryApi.getBaseUrl.mockResolvedValue(
      'http://localhost:7007/api/catalog',
    );
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockScaffolderApiWithJobs],
          [discoveryApiRef, mockDiscoveryApi],
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

  it('fetches AAP job statuses for tasks with job IDs', async () => {
    let batchRequestBody: any;

    server.use(
      rest.post(
        'http://localhost:7007/api/catalog/ansible/jobs/batch',
        async (req, res, ctx) => {
          batchRequestBody = await req.json();
          return res(
            ctx.status(200),
            ctx.json({
              jobs: {
                123: {
                  id: 123,
                  status: 'successful',
                  url: 'http://aap.example.com/jobs/123',
                },
                456: {
                  id: 456,
                  status: 'failed',
                  url: 'http://aap.example.com/jobs/456',
                },
              },
            }),
          );
        },
      ),
    );

    await render(<TaskList />);

    await waitFor(() => {
      expect(batchRequestBody).toEqual({
        jobs: [
          { taskId: 'task-1', jobId: 123 },
          { taskId: 'task-2', jobId: 456 },
        ],
      });
    });
  });

  it('displays AAP status when available', async () => {
    server.use(
      rest.post(
        'http://localhost:7007/api/catalog/ansible/jobs/batch',
        (_, res, ctx) => {
          return res(
            ctx.status(200),
            ctx.json({
              jobs: {
                123: {
                  id: 123,
                  status: 'successful',
                  url: 'http://aap.example.com/jobs/123',
                },
              },
            }),
          );
        },
      ),
    );

    await render(<TaskList />);

    await waitFor(() => {
      expect(screen.getByText('successful')).toBeInTheDocument();
    });
  });

  it('shows AAP indicator when AAP status differs from scaffolder status', async () => {
    server.use(
      rest.post(
        'http://localhost:7007/api/catalog/ansible/jobs/batch',
        (_, res, ctx) => {
          return res(
            ctx.status(200),
            ctx.json({
              jobs: {
                456: {
                  id: 456,
                  status: 'successful',
                  url: 'http://aap.example.com/jobs/456',
                },
              },
            }),
          );
        },
      ),
    );

    await render(<TaskList />);

    await waitFor(() => {
      expect(screen.getByText('(AAP)')).toBeInTheDocument();
    });
  });

  it('handles batch fetch failure gracefully', async () => {
    server.use(
      rest.post(
        'http://localhost:7007/api/catalog/ansible/jobs/batch',
        (_, res, ctx) => {
          return res(ctx.status(500));
        },
      ),
    );

    await render(<TaskList />);

    await waitFor(() => {
      expect(screen.getByText('Test Template')).toBeInTheDocument();
    });
  });

  it('skips batch fetch when no tasks have job IDs', async () => {
    const mockTasksWithoutJobs = {
      tasks: [
        {
          id: 'task-1',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'test-template',
                  title: 'Test Template',
                  namespace: 'default',
                },
              },
            },
            user: {
              entity: {
                metadata: {
                  title: 'Test User',
                },
              },
            },
          },
        },
      ],
      totalTasks: 1,
    };

    const mockScaffolderApiNoJobs = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockTasksWithoutJobs),
    };

    let batchEndpointCalled = false;
    server.use(
      rest.post(
        'http://localhost:7007/api/catalog/ansible/jobs/batch',
        (_, res, ctx) => {
          batchEndpointCalled = true;
          return res(ctx.status(200), ctx.json({ jobs: {} }));
        },
      ),
    );

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockScaffolderApiNoJobs],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('Test Template')).toBeInTheDocument();
    });

    expect(batchEndpointCalled).toBe(false);
  });

  it('handles AbortError silently during cleanup', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    server.use(
      rest.post(
        'http://localhost:7007/api/catalog/ansible/jobs/batch',
        async (_, res, ctx) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return res(ctx.status(200), ctx.json({ jobs: {} }));
        },
      ),
    );

    const { unmount } = await render(<TaskList />);

    unmount();

    await waitFor(() => {
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    consoleErrorSpy.mockRestore();
  });

  it('displays all status icons correctly', async () => {
    const mockTasksWithStatuses = {
      tasks: [
        {
          id: 'task-failed',
          status: 'failed',
          createdAt: '2024-01-01T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 't1',
                  title: 'Failed Task',
                  namespace: 'default',
                },
              },
            },
            user: { entity: { metadata: { title: 'User' } } },
          },
        },
        {
          id: 'task-completed',
          status: 'completed',
          createdAt: '2024-01-02T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 't2',
                  title: 'Completed Task',
                  namespace: 'default',
                },
              },
            },
            user: { entity: { metadata: { title: 'User' } } },
          },
        },
        {
          id: 'task-processing',
          status: 'processing',
          createdAt: '2024-01-03T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 't3',
                  title: 'Processing Task',
                  namespace: 'default',
                },
              },
            },
            user: { entity: { metadata: { title: 'User' } } },
          },
        },
        {
          id: 'task-open',
          status: 'open',
          createdAt: '2024-01-04T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 't4',
                  title: 'Open Task',
                  namespace: 'default',
                },
              },
            },
            user: { entity: { metadata: { title: 'User' } } },
          },
        },
        {
          id: 'task-cancelled',
          status: 'cancelled',
          createdAt: '2024-01-05T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 't5',
                  title: 'Cancelled Task',
                  namespace: 'default',
                },
              },
            },
            user: { entity: { metadata: { title: 'User' } } },
          },
        },
      ],
      totalTasks: 5,
    };

    const mockApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockTasksWithStatuses),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('failed')).toBeInTheDocument();
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('processing')).toBeInTheDocument();
      expect(screen.getByText('open')).toBeInTheDocument();
      expect(screen.getByText('cancelled')).toBeInTheDocument();
    });
  });

  it('handles pagination controls', async () => {
    const mockManyTasks = {
      tasks: Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        spec: {
          templateInfo: {
            entity: {
              metadata: {
                name: `template-${i}`,
                title: `Template ${i}`,
                namespace: 'default',
              },
            },
          },
          user: { entity: { metadata: { title: 'User' } } },
        },
      })),
      totalTasks: 25,
    };

    const mockApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockManyTasks),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByLabelText('next page')).toBeInTheDocument();
    });

    // Click next page
    const nextButton = screen.getByLabelText('next page');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(mockApi.listTasks).toHaveBeenCalledWith({
        filterByOwnership: 'owned',
        limit: 10,
        offset: 10,
      });
    });

    // Click previous page
    const prevButton = screen.getByLabelText('previous page');
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(mockApi.listTasks).toHaveBeenCalledWith({
        filterByOwnership: 'owned',
        limit: 10,
        offset: 0,
      });
    });

    // Click first page
    const firstButton = screen.getByLabelText('first page');
    fireEvent.click(firstButton);

    await waitFor(() => {
      expect(mockApi.listTasks).toHaveBeenCalledWith({
        filterByOwnership: 'owned',
        limit: 10,
        offset: 0,
      });
    });

    // Click last page
    const lastButton = screen.getByLabelText('last page');
    fireEvent.click(lastButton);

    await waitFor(() => {
      expect(mockApi.listTasks).toHaveBeenCalledWith({
        filterByOwnership: 'owned',
        limit: 10,
        offset: 20,
      });
    });
  });

  it('handles rows per page change', async () => {
    const mockManyTasks = {
      tasks: Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        spec: {
          templateInfo: {
            entity: {
              metadata: {
                name: `template-${i}`,
                title: `Template ${i}`,
                namespace: 'default',
              },
            },
          },
          user: { entity: { metadata: { title: 'User' } } },
        },
      })),
      totalTasks: 50,
    };

    const mockApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockManyTasks),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApi],
          [discoveryApiRef, mockDiscoveryApi],
          [identityApiRef, mockIdentityApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });

    // MUI v4 uses a non-native Select — interact with the visible trigger div
    const hiddenInput = screen.getByDisplayValue('10');
    const muiSelectRoot = hiddenInput.closest('[class*="MuiInputBase"]');
    const trigger = muiSelectRoot?.querySelector(
      '[class*="MuiSelect-select"]',
    ) as HTMLElement;
    fireEvent.mouseDown(trigger);

    const option25 = await screen.findByRole('option', { name: '25' });
    fireEvent.click(option25);

    await waitFor(() => {
      expect(mockApi.listTasks).toHaveBeenCalledWith({
        filterByOwnership: 'owned',
        limit: 25,
        offset: 0,
      });
    });
  });

  it('renders task ID as clickable link', async () => {
    await render(<TaskList />);

    await waitFor(() => {
      const taskLink = screen.getByText('task-1');
      expect(taskLink).toBeInTheDocument();
      expect(taskLink.closest('button')).toBeInTheDocument();
    });
  });

  it('renders template name as clickable link', async () => {
    await render(<TaskList />);

    await waitFor(() => {
      const templateLink = screen.getByText('Test Template');
      expect(templateLink).toBeInTheDocument();
      expect(templateLink.closest('button')).toBeInTheDocument();
    });
  });

  it('renders template with custom namespace', async () => {
    const mockTaskWithNamespace = {
      tasks: [
        {
          id: 'task-ns',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'my-template',
                  title: 'Custom NS Template',
                  namespace: 'custom-ns',
                },
              },
            },
            user: { entity: { metadata: { title: 'User' } } },
          },
        },
      ],
      totalTasks: 1,
    };

    const mockApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockTaskWithNamespace),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('Custom NS Template')).toBeInTheDocument();
      expect(screen.getByText('task-ns')).toBeInTheDocument();
    });
  });

  it('displays "Untitled" for template without name', async () => {
    const mockTaskNoName = {
      tasks: [
        {
          id: 'task-no-name',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  namespace: 'default',
                },
              },
            },
            user: { entity: { metadata: { title: 'User' } } },
          },
        },
      ],
      totalTasks: 1,
    };

    const mockApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockTaskNoName),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('task-no-name')).toBeInTheDocument();
      expect(screen.getByText('Untitled')).toBeInTheDocument();
    });
  });

  it('displays loading state', async () => {
    const mockSlowApi = {
      ...mockScaffolderApi,
      listTasks: jest
        .fn()
        .mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 1000)),
        ),
    };

    renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockSlowApi],
          [discoveryApiRef, mockDiscoveryApi],
          [identityApiRef, mockIdentityApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
  });

  it('handles missing listTasks method', async () => {
    const mockApiWithoutListTasks = {
      ...mockScaffolderApi,
      listTasks: undefined,
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApiWithoutListTasks],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(
        screen.getByText(/listTasks method is not available/i),
      ).toBeInTheDocument();
    });
  });

  it('formats dates correctly', async () => {
    const mockTaskWithDate = {
      tasks: [
        {
          id: 'task-date',
          status: 'completed',
          createdAt: '2024-06-15T14:30:45Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'test-template',
                  title: 'Date Test',
                  namespace: 'default',
                },
              },
            },
            user: { entity: { metadata: { title: 'Test User' } } },
          },
        },
      ],
      totalTasks: 1,
    };

    const mockApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockTaskWithDate),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      // Check that date is formatted (contains month name)
      expect(screen.getByText(/June/i)).toBeInTheDocument();
    });
  });

  it('handles task without user metadata', async () => {
    const mockTaskNoUser = {
      tasks: [
        {
          id: 'task-no-user',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'test-template',
                  title: 'No User Task',
                  namespace: 'default',
                },
              },
            },
          },
        },
      ],
      totalTasks: 1,
    };

    const mockApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockTaskNoUser),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('task-no-user')).toBeInTheDocument();
    });
  });

  it('handles task without template metadata', async () => {
    const mockTaskNoTemplate = {
      tasks: [
        {
          id: 'task-no-template',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
          spec: {
            user: { entity: { metadata: { title: 'Test User' } } },
          },
        },
      ],
      totalTasks: 1,
    };

    const mockApi = {
      ...mockScaffolderApi,
      listTasks: jest.fn().mockResolvedValue(mockTaskNoTemplate),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <TaskList />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('task-no-template')).toBeInTheDocument();
      expect(screen.getByText('Untitled')).toBeInTheDocument();
    });
  });
});
