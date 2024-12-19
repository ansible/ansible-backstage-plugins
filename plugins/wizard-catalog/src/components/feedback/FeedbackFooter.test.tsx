import React from 'react';
import { FeedbackFooter } from './FeedbackFooter';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen } from '@testing-library/react';
import { registerMswTestHooks, renderInTestApp } from '@backstage/test-utils';
import { FavoritesProvider } from '../../helpers/Favorite';

describe('FeedbackFooter', () => {
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
    return renderInTestApp(<FavoritesProvider>{children}</FavoritesProvider>);
  };

  it('should render', async () => {
    await render(<FeedbackFooter />);
    expect(screen.getByText('Feedback')).toBeInTheDocument();
  });
});
