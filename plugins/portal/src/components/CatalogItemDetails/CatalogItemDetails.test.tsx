import React from 'react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen } from '@testing-library/react';
import {
  registerMswTestHooks,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { mockCatalogApi } from '../../tests/catalogApi_utils';
import { CatalogItemsDetails } from './CatalogItemDetails';
import { rootRouteRef } from '../../routes';

describe('Catalog items details', () => {
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
      <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
        <>{children}</>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/portal': rootRouteRef,
        },
      },
    );
  };

  it('should render', async () => {
    await render(<CatalogItemsDetails />);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    const elements = screen.queryAllByText(
      /Use this template to create actual wizard use case templates/i,
    );
    expect(elements.length).toBeGreaterThan(0);
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('RedHat')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('service')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('aap-operations')).toBeInTheDocument();
    expect(screen.getByText('intermediate')).toBeInTheDocument();
  });
});
