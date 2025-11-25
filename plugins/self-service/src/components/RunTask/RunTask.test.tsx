import { RunTask } from './RunTask';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockApis,
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { rootRouteRef } from '../../routes';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { mockScaffolderApi } from '../../tests/scaffolderApi_utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import type { ReactNode } from 'react';

// Mock modules before imports
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ taskId: 'test-task-id' }),
  useNavigate: () => mockNavigate,
}));

const mockRouteRefFn = jest.fn((params: any) => {
  return `/templates/${params.namespace}/${params.templateName}`;
});

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => mockRouteRefFn,
}));

// Mock the entire scaffolder-react module
jest.mock('@backstage/plugin-scaffolder-react', () => ({
  scaffolderApiRef: { id: 'plugin.scaffolder' },
  useTaskEventStream: jest.fn().mockImplementation(() => ({
    task: {
      spec: {
        templateInfo: {
          entity: {
            metadata: {
              title: 'Test Template',
              description: 'Test Template Description',
            },
          },
        },
        steps: [
          { id: 'step1', name: 'Step 1' },
          { id: 'step2', name: 'Step 2' },
        ],
      },
    },
    completed: true,
    loading: false,
    error: undefined,
    output: {
      links: [
        { title: 'Link 1', url: 'https://example.com/link1' },
        { title: 'Link 2', url: 'https://example.com/link2' },
      ],
    },
    steps: {
      step1: { status: 'completed' },
      step2: { status: 'completed' },
    },
    stepLogs: {
      step1: ['Log 1 for step 1', 'Log 2 for step 1'],
      step2: ['Log 1 for step 2'],
    },
  })),
}));

// Mock the TaskSteps component
jest.mock('@backstage/plugin-scaffolder-react/alpha', () => ({
  TaskSteps: jest.fn(() => <div data-testid="task-steps">Task Steps Mock</div>),
}));

// Mock the Page and Header components from @backstage/core-components
jest.mock('@backstage/core-components', () => {
  return {
    Page: ({
      children,
      themeId,
    }: {
      children: ReactNode;
      themeId?: string;
    }) => (
      <div data-testid="page" data-theme-id={themeId}>
        {children}
      </div>
    ),
    Header: ({
      title,
      subtitle,
      pageTitleOverride,
    }: {
      title: ReactNode;
      subtitle?: ReactNode;
      pageTitleOverride?: string;
    }) => (
      <header data-testid="header">
        <div data-testid="header-title">{title}</div>
        {subtitle && <div data-testid="header-subtitle">{subtitle}</div>}
        {pageTitleOverride && (
          <div data-testid="page-title-override">{pageTitleOverride}</div>
        )}
      </header>
    ),
    Content: ({ children }: { children: ReactNode }) => (
      <div data-testid="content">{children}</div>
    ),
    MarkdownContent: ({ content }: { content: string }) => (
      <div data-testid="markdown-content">{content}</div>
    ),
    CircularProgress: () => <div role="progressbar" />,
  };
});

describe('RunTask', () => {
  const server = setupServer();
  // Enable sane handlers for network requests
  registerMswTestHooks(server);

  const mockCatalogApi = {
    getEntities: jest.fn(),
    getEntityByRef: jest.fn(),
  };

  // setup mock response
  beforeEach(() => {
    if (typeof globalThis.TextEncoder === 'undefined') {
      globalThis.TextEncoder = class TextEncoder {
        encode(str: string) {
          const utf8 = [];
          for (let i = 0; i < str.length; i++) {
            let charcode = str.charCodeAt(i);
            if (charcode < 0x80) utf8.push(charcode);
            else if (charcode < 0x800) {
              utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
            } else if (charcode < 0xd800 || charcode >= 0xe000) {
              utf8.push(
                0xe0 | (charcode >> 12),
                0x80 | ((charcode >> 6) & 0x3f),
                0x80 | (charcode & 0x3f),
              );
            } else {
              i++;
              charcode =
                0x10000 +
                (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
              utf8.push(
                0xf0 | (charcode >> 18),
                0x80 | ((charcode >> 12) & 0x3f),
                0x80 | ((charcode >> 6) & 0x3f),
                0x80 | (charcode & 0x3f),
              );
            }
          }
          return new Uint8Array(utf8);
        }
      } as any;
    }

    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
    jest.clearAllMocks();
    mockNavigate.mockClear();
    mockCatalogApi.getEntityByRef.mockRejectedValue(
      new Error('Entity not found'),
    );
    if (!mockScaffolderApi.cancelTask) {
      mockScaffolderApi.cancelTask = jest.fn().mockResolvedValue(undefined);
    }
  });

  const render = async (children: JSX.Element) => {
    const result = await renderInTestApp(
      <TestApiProvider
        apis={[
          [scaffolderApiRef, mockScaffolderApi],
          [permissionApiRef, mockApis.permission()],
          [catalogApiRef, mockCatalogApi],
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
    const originalRerender = result.rerender;
    result.rerender = (newChildren: React.ReactNode) => {
      return originalRerender(
        <TestApiProvider
          apis={[
            [scaffolderApiRef, mockScaffolderApi],
            [permissionApiRef, mockApis.permission()],
            [catalogApiRef, mockCatalogApi],
          ]}
        >
          <>{newChildren}</>
        </TestApiProvider>,
      );
    };
    return result;
  };

  it('should render the task details', async () => {
    await render(<RunTask />);

    expect(screen.getByTestId('header-title')).toHaveTextContent(
      'Test Template',
    );
    expect(screen.getByTestId('header-subtitle')).toHaveTextContent(
      'Test Template Description',
    );
  });

  it('should render task steps', async () => {
    await render(<RunTask />);

    // Check for the mocked TaskSteps component
    expect(screen.getByTestId('task-steps')).toBeInTheDocument();
    expect(screen.getByText('Show Logs')).toBeInTheDocument();
    expect(screen.getByText('Link 1')).toBeInTheDocument();
    expect(screen.getByText('Link 2')).toBeInTheDocument();
  });

  it('should toggle logs visibility when button is clicked', async () => {
    const user = userEvent.setup();
    await render(<RunTask />);

    // Initially logs should not be visible
    expect(screen.queryByText('step1:')).not.toBeInTheDocument();

    // Click the Show Logs button
    await user.click(screen.getByText('Show Logs'));

    // Now logs should be visible
    await waitFor(() => {
      expect(screen.getByText('step1:')).toBeInTheDocument();
      expect(screen.getByText('Log 1 for step 1')).toBeInTheDocument();
      expect(screen.getByText('Log 2 for step 1')).toBeInTheDocument();
      expect(screen.getByText('step2:')).toBeInTheDocument();
      expect(screen.getByText('Log 1 for step 2')).toBeInTheDocument();
    });

    // Click the Hide Logs button
    await user.click(screen.getByText('Hide Logs'));

    // Logs should be hidden again
    await waitFor(() => {
      expect(screen.queryByText('step1:')).not.toBeInTheDocument();
    });
  });

  it('should render loading state', async () => {
    // Create a separate mock implementation for this test
    const useTaskEventStreamMock =
      require('@backstage/plugin-scaffolder-react').useTaskEventStream;

    // Save the original implementation
    const originalImplementation =
      useTaskEventStreamMock.getMockImplementation();

    // Override for this test only
    useTaskEventStreamMock.mockImplementation(() => ({
      loading: true,
      task: undefined,
      completed: false,
      error: undefined,
      output: undefined,
      steps: {},
      stepLogs: {},
    }));

    // We need to create a custom mock for the Header component for this specific test
    const originalHeaderMock = jest.requireMock(
      '@backstage/core-components',
    ).Header;
    jest.requireMock('@backstage/core-components').Header = ({
      title,
    }: {
      title: string;
    }) => (
      <header data-testid="header">
        <div>{title}</div>
      </header>
    );

    await render(<RunTask />);

    // Check for the loading state elements
    expect(screen.getByText('Template in Progress')).toBeInTheDocument();
    expect(screen.getByText('Executing Template...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Restore the original mocks
    useTaskEventStreamMock.mockImplementation(originalImplementation);
    jest.requireMock('@backstage/core-components').Header = originalHeaderMock;
  });

  it('should handle cancelled task status', async () => {
    const useTaskEventStreamMock =
      require('@backstage/plugin-scaffolder-react').useTaskEventStream;

    const originalImplementation =
      useTaskEventStreamMock.getMockImplementation();

    useTaskEventStreamMock.mockImplementation(() => ({
      task: {
        status: 'cancelled',
        spec: {
          templateInfo: {
            entity: {
              metadata: {
                title: 'Test Template',
                description: 'Test Template Description',
              },
            },
          },
          steps: [
            { id: 'step1', name: 'Step 1' },
            { id: 'step2', name: 'Step 2' },
          ],
        },
      },
      completed: false,
      loading: false,
      error: undefined,
      output: { links: [] },
      steps: {},
      stepLogs: {},
    }));

    await render(<RunTask />);

    await waitFor(() => {
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      expect(cancelButton).toBeDisabled();
    });

    useTaskEventStreamMock.mockImplementation(originalImplementation);
  });

  it('should reset isCanceling when task status changes from processing', async () => {
    const useTaskEventStreamMock =
      require('@backstage/plugin-scaffolder-react').useTaskEventStream;

    const originalImplementation =
      useTaskEventStreamMock.getMockImplementation();

    let mockTaskStatus = 'processing';
    let mockCompleted = false;

    useTaskEventStreamMock.mockImplementation(() => ({
      task: {
        status: mockTaskStatus,
        spec: {
          templateInfo: {
            entity: {
              metadata: {
                title: 'Test Template',
              },
            },
          },
          steps: [{ id: 'step1', name: 'Step 1' }],
        },
      },
      completed: mockCompleted,
      loading: false,
      error: undefined,
      output: { links: [] },
      steps: {
        step1: {
          status: mockTaskStatus === 'processing' ? 'processing' : 'completed',
        },
      },
      stepLogs: {},
    }));

    const { rerender } = await render(<RunTask />);

    const user = userEvent.setup();
    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(mockScaffolderApi.cancelTask).toHaveBeenCalled();
    });

    mockTaskStatus = 'completed';
    mockCompleted = true;

    useTaskEventStreamMock.mockImplementation(() => ({
      task: {
        status: mockTaskStatus,
        spec: {
          templateInfo: {
            entity: {
              metadata: {
                title: 'Test Template',
              },
            },
          },
          steps: [{ id: 'step1', name: 'Step 1' }],
        },
      },
      completed: mockCompleted,
      loading: false,
      error: undefined,
      output: { links: [] },
      steps: { step1: { status: 'completed' } },
      stepLogs: {},
    }));

    rerender(<RunTask />);

    await waitFor(
      () => {
        const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
        expect(cancelBtn).toBeDisabled();
      },
      { timeout: 2000 },
    );

    useTaskEventStreamMock.mockImplementation(originalImplementation);
  });

  describe('Cancel functionality', () => {
    it('should call cancelTask when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      const cancelTaskSpy = jest.fn().mockResolvedValue(undefined);
      mockScaffolderApi.cancelTask = cancelTaskSpy;

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          status: 'processing',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: false,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'processing' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        const cancelButton = screen.getByText('Cancel');
        expect(cancelButton).toBeInTheDocument();
        expect(cancelButton).not.toBeDisabled();
      });

      await user.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(cancelTaskSpy).toHaveBeenCalledWith('test-task-id');
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should handle cancel error and reset isCanceling', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const user = userEvent.setup();
      const cancelTaskSpy = jest
        .fn()
        .mockRejectedValue(new Error('Cancel failed'));
      mockScaffolderApi.cancelTask = cancelTaskSpy;

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          status: 'processing',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: false,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'processing' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to cancel task:',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should not cancel if conditions are not met', async () => {
      const cancelTaskSpy = jest.fn();
      mockScaffolderApi.cancelTask = cancelTaskSpy;

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          status: 'completed',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      expect(cancelTaskSpy).not.toHaveBeenCalled();

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Start Over functionality', () => {
    beforeEach(() => {
      mockNavigate.mockClear();
      mockRouteRefFn.mockClear();
      mockRouteRefFn.mockImplementation((params: any) => {
        return `/templates/${params.namespace}/${params.templateName}`;
      });
    });

    it('should navigate to template creation with parameters on Start Over', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'test-template',
                  namespace: 'default',
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              name: 'test-param',
              description: 'test description',
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        const startOverButton = screen.getByText('Start Over');
        expect(startOverButton).toBeInTheDocument();
      });

      await user.click(screen.getByText('Start Over'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/templates/default/test-template',
          {
            state: {
              initialFormData: {
                name: 'test-param',
                description: 'test description',
              },
            },
          },
        );
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should filter out token from parameters when starting over', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'test-template',
                  namespace: 'default',
                },
              },
            },
            parameters: {
              name: 'test-param',
              token: 'secret-token',
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByText('Start Over')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Start Over'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/templates/default/test-template',
          {
            state: {
              initialFormData: {
                name: 'test-param',
              },
            },
          },
        );
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should use default namespace when namespace is missing', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'test-template',
                },
              },
            },
            parameters: {},
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByText('Start Over')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Start Over'));

      await waitFor(() => {
        expect(mockRouteRefFn).toHaveBeenCalledWith({
          namespace: 'default',
          templateName: 'test-template',
        });
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should return early from handleStartOver if conditions are not met', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          status: 'processing',
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'test-template',
                  namespace: 'default',
                },
              },
            },
            parameters: {},
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: false,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'processing' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        const startOverButton = screen.getByRole('button', {
          name: 'Start Over',
        });
        expect(startOverButton).toBeDisabled();
      });

      mockNavigate.mockClear();

      expect(mockNavigate).not.toHaveBeenCalled();

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should return early from handleStartOver if task metadata is missing', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          status: 'completed',
          spec: {
            templateInfo: null,
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      mockNavigate.mockClear();

      const startOverButton = screen.queryByRole('button', {
        name: 'Start Over',
      });

      expect(startOverButton).toBeInTheDocument();
      expect(startOverButton).not.toBeDisabled();

      expect(mockNavigate).not.toHaveBeenCalled();

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Entity link navigation', () => {
    beforeEach(() => {
      mockNavigate.mockClear();
    });

    it('should handle entityRef link with namespace', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: {
          links: [
            {
              title: 'View Component',
              entityRef: 'component:my-namespace/my-component',
            },
          ],
        },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByText('View Component')).toBeInTheDocument();
      });

      await user.click(screen.getByText('View Component'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/catalog/my-namespace/component/my-component',
        );
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should handle entityRef link without namespace', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: {
          links: [
            {
              title: 'View Component',
              entityRef: 'component:my-component',
            },
          ],
        },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByText('View Component')).toBeInTheDocument();
      });

      await user.click(screen.getByText('View Component'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/catalog/default/component/my-component',
        );
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should log warning for unexpected entityRef format', async () => {
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: {
          links: [
            {
              title: 'Invalid Link',
              entityRef: 'invalid-format',
            },
          ],
        },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Invalid Link'));

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Unexpected entityRef format: invalid-format',
        );
      });

      expect(mockNavigate).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Back button functionality', () => {
    beforeEach(() => {
      mockNavigate.mockClear();
      mockRouteRefFn.mockClear();
    });

    it('should navigate back to template page when back button is clicked', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  name: 'test-template',
                  namespace: 'default',
                  title: 'Test Template',
                },
              },
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByTestId('back-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('back-button'));

      await waitFor(() => {
        expect(mockRouteRefFn).toHaveBeenCalledWith({
          namespace: 'default',
          templateName: 'test-template',
        });
        expect(mockNavigate).toHaveBeenCalledWith(
          '/templates/default/test-template',
        );
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should navigate back in history when template metadata is missing', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: null,
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByTestId('back-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('back-button'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(-1);
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Download archive functionality', () => {
    let createElementSpy: jest.SpyInstance | null = null;
    let appendChildSpy: jest.SpyInstance | null = null;
    let removeSpy: jest.SpyInstance | null = null;

    beforeEach(() => {
      mockCatalogApi.getEntityByRef.mockClear();
    });

    afterEach(() => {
      if (createElementSpy) {
        createElementSpy.mockRestore();
        createElementSpy = null;
      }
      if (appendChildSpy) {
        appendChildSpy.mockRestore();
        appendChildSpy = null;
      }
      if (removeSpy) {
        removeSpy.mockRestore();
        removeSpy = null;
      }
    });

    it('should show download button when entity is found and task is completed', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition:
            'version: 3\nimages:\n  base_image:\n    name: quay.io/test',
          readme: '# Test EE\nThis is a test execution environment.',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(mockEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByText('Download EE Files')).toBeInTheDocument();
        },
        { timeout: 10000 },
      );

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should not show download button when publishToSCM is true', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: true,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.queryByText('Download EE Files')).not.toBeInTheDocument();
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should download archive when download button is clicked', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition:
            'version: 3\nimages:\n  base_image:\n    name: quay.io/test',
          readme: '# Test EE\nThis is a test execution environment.',
          mcp_vars: 'mcp_vars: test',
          ansible_cfg: 'ansible_cfg: test',
          template: 'template: test',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(mockEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByText('Download EE Files')).toBeInTheDocument();
        },
        { timeout: 10000 },
      );

      const createObjectURLSpy = jest.fn(() => 'blob:mock-url');
      const revokeObjectURLSpy = jest.fn();
      globalThis.URL.createObjectURL = createObjectURLSpy;
      globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

      const mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: jest.fn(),
        remove: jest.fn(),
      } as any;

      const originalCreateElement = Document.prototype.createElement;

      createElementSpy = jest.spyOn(document, 'createElement');
      createElementSpy.mockImplementation(function createElementMock(
        this: Document,
        tagName: string,
      ) {
        if (tagName === 'a') {
          return mockLink as any;
        }
        return originalCreateElement.call(this, tagName);
      });

      appendChildSpy = jest.spyOn(document.body, 'appendChild');
      removeSpy = jest.spyOn(HTMLElement.prototype, 'remove');
      appendChildSpy.mockImplementation(() => mockLink);
      removeSpy.mockImplementation(() => {});

      const downloadButton = screen.getByText('Download EE Files');
      expect(downloadButton).not.toBeDisabled();

      await user.click(downloadButton);

      await waitFor(
        () => {
          expect(createObjectURLSpy).toHaveBeenCalled();
        },
        { timeout: 10000 },
      );

      expect(mockLink.click).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');

      delete (globalThis.URL as any).createObjectURL;
      delete (globalThis.URL as any).revokeObjectURL;
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should download archive successfully without mcp_vars', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition:
            'version: 3\nimages:\n  base_image:\n    name: quay.io/test',
          readme: '# Test EE\nThis is a test execution environment.',
          // mcp_vars is not added
          ansible_cfg: 'ansible_cfg: test',
          template: 'template: test',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(mockEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByText('Download EE Files')).toBeInTheDocument();
        },
        { timeout: 10000 },
      );

      const createObjectURLSpy = jest.fn(() => 'blob:mock-url');
      const revokeObjectURLSpy = jest.fn();
      globalThis.URL.createObjectURL = createObjectURLSpy;
      globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

      const mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: jest.fn(),
        remove: jest.fn(),
      } as any;

      const originalCreateElement = Document.prototype.createElement;

      createElementSpy = jest.spyOn(document, 'createElement');
      createElementSpy.mockImplementation(function createElementMock(
        this: Document,
        tagName: string,
      ) {
        if (tagName === 'a') {
          return mockLink as any;
        }
        return originalCreateElement.call(this, tagName);
      });

      appendChildSpy = jest.spyOn(document.body, 'appendChild');
      removeSpy = jest.spyOn(HTMLElement.prototype, 'remove');
      appendChildSpy.mockImplementation(() => mockLink);
      removeSpy.mockImplementation(() => {});

      const downloadButton = screen.getByText('Download EE Files');
      expect(downloadButton).not.toBeDisabled();

      await user.click(downloadButton);

      await waitFor(
        () => {
          expect(createObjectURLSpy).toHaveBeenCalled();
        },
        { timeout: 10000 },
      );

      expect(mockLink.click).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');

      delete (globalThis.URL as any).createObjectURL;
      delete (globalThis.URL as any).revokeObjectURL;
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should handle download error gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition:
            'version: 3\nimages:\n  base_image:\n    name: quay.io/test',
          readme: '# Test EE\nThis is a test execution environment.',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef
        .mockResolvedValueOnce(mockEntity)
        .mockRejectedValueOnce(new Error('Failed to fetch'));

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByText('Download EE Files')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      await user.click(screen.getByText('Download EE Files'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Entity fetching', () => {
    beforeEach(() => {
      mockCatalogApi.getEntityByRef.mockClear();
    });

    it('should fetch entity from catalog when task is completed', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition: 'version: 3',
          readme: '# Test',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(mockEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledWith(
            'Component:default/test-ee',
          );
        },
        { timeout: 10000 },
      );

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should log warning when entity is not found', async () => {
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(null);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Could not find registered EE component for test-ee',
          );
        },
        { timeout: 10000 },
      );

      consoleWarnSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should handle entity fetch error', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockRejectedValue(
        new Error('Failed to fetch entity'),
      );

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to fetch entity from catalog:',
            expect.any(Error),
          );
        },
        { timeout: 5000 },
      );

      consoleErrorSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('getMatchingEntity edge cases', () => {
    beforeEach(() => {
      mockCatalogApi.getEntityByRef.mockReset();
    });
    it('should fetch entity when not cached in getMatchingEntity', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition: 'version: 3',
          readme: '# Test',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(mockEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(mockCatalogApi.getEntityByRef).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should handle missing eeFileName in getMatchingEntity', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByTestId('header')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      consoleErrorSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should fetch and cache entity when not cached in getMatchingEntity', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition: 'version: 3',
          readme: '# Test',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(mockEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(mockCatalogApi.getEntityByRef).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      const calls = mockCatalogApi.getEntityByRef.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should fetch entity with execution-environment filter when not cached and set matchingEntity', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const initialEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid-initial',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition: 'version: 3',
          readme: '# Test',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(initialEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByText('Download EE Files')).toBeInTheDocument();
        },
        { timeout: 15000 },
      );

      expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledWith(
        expect.stringContaining('Component:default/'),
      );

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 20000);

    it('should find entity matching name pattern and set matchingEntity when found', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const initialEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid-initial',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition: 'version: 3',
          readme: '# Test',
          template: 'template: test',
          ansible_cfg: 'ansible_cfg: test',
          mcp_vars: 'mcp_vars: test',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(initialEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByText('Download EE Files')).toBeInTheDocument();
        },
        { timeout: 15000 },
      );

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should log error when entity is not found in catalog in getMatchingEntity', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'));

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(mockCatalogApi.getEntityByRef).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      await waitFor(
        () => {
          expect(mockCatalogApi.getEntityByRef).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      const calls = mockCatalogApi.getEntityByRef.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledWith(
        expect.stringContaining('Component:default/'),
      );

      consoleErrorSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Download archive error handling', () => {
    beforeEach(() => {
      mockCatalogApi.getEntityByRef.mockReset();
    });
    it('should handle missing entity definition or readme in handleDownloadArchive', async () => {
      jest.setTimeout(20000);
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const entityWithoutFields = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(entityWithoutFields);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByText('Download EE Files')).toBeInTheDocument();
        },
        { timeout: 15000 },
      );

      const createObjectURLSpy = jest.fn(() => 'blob:mock-url');
      const revokeObjectURLSpy = jest.fn();
      globalThis.URL.createObjectURL = createObjectURLSpy;
      globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

      const downloadButton = screen.getByText('Download EE Files');

      await user.click(downloadButton);

      await waitFor(
        () => {
          const calls = consoleErrorSpy.mock.calls;
          const hasExpectedError = calls.some(
            call =>
              typeof call[0] === 'string' &&
              call[0] ===
                'Entity, definition, readme, ansible_cfg or template not available',
          );
          expect(hasExpectedError).toBe(true);
        },
        { timeout: 15000 },
      );

      delete (globalThis.URL as any).createObjectURL;
      delete (globalThis.URL as any).revokeObjectURL;
      consoleErrorSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
      mockCatalogApi.getEntityByRef.mockReset();
    }, 30000);

    it('should handle download archive error in catch block', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          uid: 'test-uid',
        },
        spec: {
          name: 'test-ee',
          type: 'execution-environment',
          definition: 'version: 3',
          readme: '# Test',
          mcp_vars: 'mcp_vars: test',
          ansible_cfg: 'ansible_cfg: test',
          template: 'template: test',
        },
      };

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
          'create-ee-definition': { status: 'completed' },
        },
        stepLogs: {},
      }));

      mockCatalogApi.getEntityByRef.mockResolvedValue(mockEntity);

      await render(<RunTask />);

      await waitFor(
        () => {
          expect(screen.getByText('Download EE Files')).toBeInTheDocument();
        },
        { timeout: 25000 },
      );

      const originalBlob = globalThis.Blob;
      globalThis.Blob = jest.fn(() => {
        throw new Error('Blob creation error');
      }) as any;

      const downloadButton = screen.getByText('Download EE Files');
      await user.click(downloadButton);

      await waitFor(
        () => {
          const calls = consoleErrorSpy.mock.calls;
          const hasExpectedError = calls.some(
            call =>
              typeof call[0] === 'string' &&
              call[0] === 'Failed to download archive:' &&
              call[1] instanceof Error,
          );
          expect(hasExpectedError).toBe(true);
        },
        { timeout: 10000 },
      );

      globalThis.Blob = originalBlob;
      consoleErrorSpy.mockRestore();
      useTaskEventStreamMock.mockImplementation(originalImplementation);
      mockCatalogApi.getEntityByRef.mockReset();
    }, 30000);
  });

  describe('Text expansion functionality', () => {
    it('should expand and collapse text items', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'step2', name: 'Step 2' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: {
          links: [],
          text: [
            {
              title: 'Text Item 1',
              content: '# Content 1\nThis is content 1',
            },
            {
              title: 'Text Item 2',
              content: '# Content 2\nThis is content 2',
            },
          ],
        },
        steps: {
          step1: { status: 'completed' },
          step2: { status: 'completed' },
        },
        stepLogs: {},
      }));

      await render(<RunTask />);

      const textItem1 = screen.getByText('Text Item 1');
      await user.click(textItem1);

      await waitFor(() => {
        const markdownContent = screen.getAllByTestId('markdown-content');
        expect(markdownContent.length).toBeGreaterThan(0);
        expect(markdownContent[0]).toHaveTextContent('Content 1');
        expect(markdownContent[0]).toHaveTextContent('This is content 1');
      });

      const textItem2 = screen.getByText('Text Item 2');
      await user.click(textItem2);

      await waitFor(() => {
        const markdownContent = screen.getAllByTestId('markdown-content');
        expect(markdownContent.length).toBeGreaterThan(0);
        expect(markdownContent[0]).toHaveTextContent('Content 2');
        expect(markdownContent[0]).not.toHaveTextContent('Content 1');
      });

      await user.click(textItem2);

      await waitFor(() => {
        const markdownContent = screen.queryAllByTestId('markdown-content');
        const hasTextContent = markdownContent.some(el =>
          el.textContent?.includes('Content 2'),
        );
        expect(hasTextContent).toBe(false);
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should hide logs when text item is expanded', async () => {
      const user = userEvent.setup();

      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'step2', name: 'Step 2' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: {
          links: [],
          text: [
            {
              title: 'Text Item 1',
              content: '# Content 1',
            },
          ],
        },
        steps: {
          step1: { status: 'completed' },
          step2: { status: 'completed' },
        },
        stepLogs: {
          step1: ['Log 1'],
        },
      }));

      await render(<RunTask />);

      await user.click(screen.getByText('Show Logs'));
      await waitFor(() => {
        expect(screen.getByText('step1:')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Text Item 1'));

      await waitFor(() => {
        expect(screen.queryByText('step1:')).not.toBeInTheDocument();
        const markdownContent = screen.getByTestId('markdown-content');
        expect(markdownContent).toHaveTextContent('Content 1');
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Link filtering with if conditions', () => {
    it('should filter out links with if condition set to false', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: {
          links: [
            { title: 'Link 1', url: 'https://example.com/link1' },
            { title: 'Link 2', url: 'https://example.com/link2', if: false },
            { title: 'Link 3', url: 'https://example.com/link3', if: true },
            { title: 'Link 4', url: 'https://example.com/link4' },
          ],
        },
        steps: { step1: { status: 'completed' } },
        stepLogs: {},
      }));

      await render(<RunTask />);

      await waitFor(() => {
        expect(screen.getByText('Link 1')).toBeInTheDocument();
        expect(screen.queryByText('Link 2')).not.toBeInTheDocument();
        expect(screen.getByText('Link 3')).toBeInTheDocument();
        expect(screen.getByText('Link 4')).toBeInTheDocument();
      });

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Task status edge cases', () => {
    it('should handle failed task status', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'step2', name: 'Step 2' },
            ],
          },
        },
        completed: true,
        loading: false,
        error: new Error('Task failed'),
        output: { links: [] },
        steps: {
          step1: { status: 'failed' },
          step2: { status: 'failed' },
        },
        stepLogs: {},
      }));

      await render(<RunTask />);

      expect(screen.queryByText('Download EE Files')).not.toBeInTheDocument();

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });

  describe('Show download button edge cases', () => {
    it('should not show download button when task is not completed', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [
              { id: 'step1', name: 'Step 1' },
              { id: 'create-ee-definition', name: 'Create EE Definition' },
            ],
          },
        },
        completed: false,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'processing' },
          'create-ee-definition': { status: 'open' },
        },
        stepLogs: {},
      }));

      await render(<RunTask />);

      expect(screen.queryByText('Download EE Files')).not.toBeInTheDocument();

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);

    it('should not show download button when there is no create-ee-definition step', async () => {
      const useTaskEventStreamMock =
        require('@backstage/plugin-scaffolder-react').useTaskEventStream;

      const originalImplementation =
        useTaskEventStreamMock.getMockImplementation();

      useTaskEventStreamMock.mockImplementation(() => ({
        task: {
          spec: {
            templateInfo: {
              entity: {
                metadata: {
                  title: 'Test Template',
                },
              },
            },
            parameters: {
              eeFileName: 'test-ee',
              publishToSCM: false,
            },
            steps: [{ id: 'step1', name: 'Step 1' }],
          },
        },
        completed: true,
        loading: false,
        error: undefined,
        output: { links: [] },
        steps: {
          step1: { status: 'completed' },
        },
        stepLogs: {},
      }));

      await render(<RunTask />);

      expect(screen.queryByText('Download EE Files')).not.toBeInTheDocument();

      useTaskEventStreamMock.mockImplementation(originalImplementation);
    }, 15000);
  });
});
