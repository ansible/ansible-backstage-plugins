import React from 'react';
import { WizardCatalog } from './WizardCatalog';
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
import { FavoritesProvider } from '../../helpers/Favorite';

describe('WizardCatalog', () => {
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
        <FavoritesProvider>{children}</FavoritesProvider>
      </TestApiProvider>,
    );
  };

  it('should render', async () => {
    await render(<WizardCatalog />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Clear all')).toBeInTheDocument();
    expect(screen.getByText('Domain')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Wizard')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    // load wizard card
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('Create wizard use cases')).toBeInTheDocument();
    expect(screen.getByText('DESCRIPTION')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use this template to create actual wizard use case templates',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
    expect(screen.getByText('RedHat')).toBeInTheDocument();
    expect(screen.getByText('TAGS')).toBeInTheDocument();
    expect(screen.getByText('aap-operations')).toBeInTheDocument();
    expect(screen.getByText('intermediate')).toBeInTheDocument();
    expect(screen.getByText('Choose')).toBeInTheDocument();
  });
});
