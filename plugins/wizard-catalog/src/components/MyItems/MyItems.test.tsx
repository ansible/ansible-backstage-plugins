import React from 'react';
import { MyItems } from './MyItems';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen } from '@testing-library/react';
import {
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { FavoritesProvider } from '../../helpers/Favorite';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { mockScaffolderApi } from '../../tests/scaffolderApi_utils';

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
        <FavoritesProvider>{children}</FavoritesProvider>
      </TestApiProvider>,
    );
  };

  it('should render', async () => {
    await render(<MyItems />);
    expect(screen.getByText('My items')).toBeInTheDocument();
    expect(
      screen.getByText('All tasks that have been started'),
    ).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Clear all')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Name' }),
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
