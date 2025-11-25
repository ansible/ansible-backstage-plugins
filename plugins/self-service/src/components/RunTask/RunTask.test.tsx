import { RunTask } from './RunTask';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { rootRouteRef } from '../../routes';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { mockScaffolderApi } from '../../tests/scaffolderApi_utils';
import type { ReactNode } from 'react';

// Mock modules before imports
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ taskId: 'test-task-id' }),
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

  // setup mock response
  beforeEach(() => {
    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
    jest.clearAllMocks();
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
});
