import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import {
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { mockScaffolderApi } from '../../tests/scaffolderApi_utils';
import { CreateTask } from './CreateTask';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { rhAapAuthApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';

// Mock the module
const mockNavigate = jest.fn();
const mockLocation = { state: null, pathname: '', search: '', hash: '' };
const mockRouteRefFn = jest.fn(() => '/self-service');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'), // keep other exports intact
  useParams: jest.fn(), // Mock `useParams`
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => mockRouteRefFn,
}));

const mockRhAapAuthApi = {
  getAccessToken: jest.fn().mockResolvedValue('mocked-access-token'),
};

const mockCatalogApi = {
  getEntityByRef: jest.fn(),
};

describe('Create task', () => {
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
          [catalogApiRef, mockCatalogApi],
          [rhAapAuthApiRef, mockRhAapAuthApi],
        ]}
      >
        {children}
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    mockRouteRefFn.mockClear();
    mockRouteRefFn.mockReturnValue('/self-service');
    Object.assign(mockLocation, {
      state: null,
      pathname: '',
      search: '',
      hash: '',
    });
  });

  it('should render', async () => {
    // Mock the return value of useParams directly
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'generic-seed',
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue(null);

    await render(<CreateTask />);
    expect(
      screen.getByText(
        'Use this template to create actual wizard use case templates',
      ),
    ).toBeInTheDocument();
  });

  it('should handle initialFormData from location state', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'generic-seed',
    });

    Object.assign(mockLocation, {
      state: {
        initialFormData: { name: 'test-name', description: 'test-desc' },
      },
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue(null);

    await render(<CreateTask />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Use this template to create actual wizard use case templates',
        ),
      ).toBeInTheDocument();
    });
  });

  it('should navigate to execution environment create tab when cancel is clicked for EE template', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'execution-environment-template',
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue({
      spec: { type: 'execution-environment' },
    });

    await render(<CreateTask />);

    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel');
      expect(cancelButton).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/self-service/ee/create');
    });
  });

  it('should navigate to self-service home when cancel is clicked for non-EE template', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'regular-template',
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue({
      spec: { type: 'service' },
    });

    await render(<CreateTask />);

    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel');
      expect(cancelButton).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/self-service\/?$/),
      );
    });
  });

  it('should handle catalog API error gracefully when fetching template entity', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'generic-seed',
    });

    mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

    await render(<CreateTask />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Use this template to create actual wizard use case templates',
        ),
      ).toBeInTheDocument();
    });
  });

  it('should default to home page navigation if template entity fetch fails', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'template-without-entity',
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue(null);

    await render(<CreateTask />);

    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel');
      expect(cancelButton).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/self-service\/?$/),
      );
    });
  });

  it('should render back button', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'generic-seed',
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue(null);

    await render(<CreateTask />);

    await waitFor(() => {
      const backButton = screen.getByTestId('back-button');
      expect(backButton).toBeInTheDocument();
    });
  });

  it('should navigate to execution environment create tab when back button is clicked for EE template', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'execution-environment-template',
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue({
      spec: { type: 'execution-environment' },
    });

    await render(<CreateTask />);

    await waitFor(() => {
      const backButton = screen.getByTestId('back-button');
      expect(backButton).toBeInTheDocument();
    });

    const backButton = screen.getByTestId('back-button');
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/self-service/ee/create');
    });
  });

  it('should navigate to self-service home when back button is clicked for non-EE template', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'regular-template',
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue({
      spec: { type: 'service' },
    });

    await render(<CreateTask />);

    await waitFor(() => {
      const backButton = screen.getByTestId('back-button');
      expect(backButton).toBeInTheDocument();
    });

    const backButton = screen.getByTestId('back-button');
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/self-service\/?$/),
      );
    });
  });

  it('should navigate to self-service home when back button is clicked if template entity is null', async () => {
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      templateName: 'template-without-entity',
    });

    mockCatalogApi.getEntityByRef.mockResolvedValue(null);

    await render(<CreateTask />);

    await waitFor(() => {
      const backButton = screen.getByTestId('back-button');
      expect(backButton).toBeInTheDocument();
    });

    const backButton = screen.getByTestId('back-button');
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/self-service\/?$/),
      );
    });
  });
});
