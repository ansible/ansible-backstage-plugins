import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';

import { ContentExpandableSidebarGroup } from './ContentExpandableSidebarGroup';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('@backstage/core-components', () => ({
  ...jest.requireActual('@backstage/core-components'),
  useSidebarOpenState: () => ({ isOpen: true }),
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({
    pathname: '/self-service/content-quality',
    search: '',
    hash: '',
    state: null,
    key: 'default',
  }),
}));

describe('ContentExpandableSidebarGroup', () => {
  it('starts expanded when a child route is active', async () => {
    await renderInTestApp(<ContentExpandableSidebarGroup />);

    expect(screen.getByRole('button', { name: 'Content' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      screen.getByRole('link', { name: /Content quality/i }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
