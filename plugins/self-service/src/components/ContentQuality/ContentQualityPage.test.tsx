/*
 * Copyright Red Hat
 */

import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';

import {
  ContentQualityPage,
  ContentQualityRedirect,
  ContentQualityRoutesPage,
} from './ContentQualityPage';

jest.mock('@backstage/plugin-permission-react', () => ({
  RequirePermission: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

describe('ContentQualityPage', () => {
  it('redirects to Git Repositories with the Quality tab selected', async () => {
    await renderInTestApp(<ContentQualityRedirect />, {
      routeEntries: ['/self-service/content-quality'],
    });

    expect(screen.getByTestId('location-display')).toHaveTextContent(
      '/self-service/repositories/quality?contentNav=content-quality',
    );
  });

  it('redirects via ContentQualityPage export', async () => {
    await renderInTestApp(<ContentQualityPage />, {
      routeEntries: ['/self-service/content-quality'],
    });

    expect(screen.getByTestId('location-display')).toHaveTextContent(
      '/self-service/repositories/quality?contentNav=content-quality',
    );
  });

  it('redirects with permission gate via ContentQualityRoutesPage', async () => {
    await renderInTestApp(<ContentQualityRoutesPage />, {
      routeEntries: ['/self-service/content-quality'],
    });

    expect(screen.getByTestId('location-display')).toHaveTextContent(
      '/self-service/repositories/quality?contentNav=content-quality',
    );
  });
});
