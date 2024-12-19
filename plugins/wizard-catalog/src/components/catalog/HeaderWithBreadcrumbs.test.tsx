import React from 'react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen } from '@testing-library/react';
import { registerMswTestHooks, renderInTestApp } from '@backstage/test-utils';
import { FavoritesProvider } from '../../helpers/Favorite';
import { HeaderWithBreadcrumbs } from './HeaderWithBreadcrumbs';

describe('Header with breadcrumbs', () => {
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

  const breadcrumbs = [
    { label: 'My items', href: '/my-items' },
    { label: 'Breadcrumb Title' || 'Unnamed' },
  ];

  it('should render', async () => {
    await render(
      <HeaderWithBreadcrumbs
        showStar
        title="Header title"
        description="Long header description"
        breadcrumbs={breadcrumbs}
      />,
    );
    expect(screen.getByText('Header title')).toBeInTheDocument();
    expect(screen.getByText('Long header description')).toBeInTheDocument();
    expect(screen.getByText('My items')).toBeInTheDocument();
    expect(screen.getByText('Breadcrumb Title')).toBeInTheDocument();
  });
});
