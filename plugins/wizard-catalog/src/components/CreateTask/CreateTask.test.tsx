import React from 'react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen } from '@testing-library/react';
import {
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { FavoritesProvider } from '../../helpers/Favorite';
import { mockScaffolderApi } from '../../tests/scaffolderApi_utils';
import { CreateTask } from './CreateTask';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { rhAapAuthApiRef } from '../../apis';

// Mock the module
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'), // keep other exports intact
  useParams: jest.fn(), // Mock `useParams`
}));

const mockRhAapAuthApi = {
  getAccessToken: jest.fn().mockResolvedValue('mocked-access-token'),
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
          [rhAapAuthApiRef, mockRhAapAuthApi],
        ]}
      >
        <FavoritesProvider>{children}</FavoritesProvider>
      </TestApiProvider>,
    );
  };

  it('should render', async () => {
    // Mock the return value of useParams directly
    (require('react-router-dom').useParams as jest.Mock).mockReturnValue({
      namespace: 'default',
      name: 'generic-seed',
    });

    await render(<CreateTask />);
    expect(
      screen.getByText(
        'Use this template to create actual wizard use case templates',
      ),
    ).toBeInTheDocument();
  });
});
