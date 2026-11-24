import { fireEvent, screen, within } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import ansiblePlugin from '@ansible/plugin-backstage-rhaap/alpha';
import portalNavigation from '@ansible/portal-core/app-nav';
import {
  catalogApiRef,
  MockStarredEntitiesApi,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';

it('opens the native Ansible page from the Portal sidebar', async () => {
  await renderTestApp({
    features: [ansiblePlugin, portalNavigation],
    config: {
      app: { extensions: [{ 'nav-content:app/portal': true }] },
      portal: {
        navigation: {
          items: [{ id: 'ansible', page: 'page:ansible', title: 'Ansible' }],
        },
      },
    },
    initialRouteEntries: ['/'],
    apis: [
      [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      [starredEntitiesApiRef, new MockStarredEntitiesApi()],
    ],
  });

  const link = await within(
    await screen.findByRole('navigation', { name: 'sidebar nav' }),
  ).findByRole('link', { name: 'Ansible' });
  expect(link).toHaveAttribute('href', '/ansible');
  fireEvent.click(link);
  // Loading the real page also transforms its workspace dependencies on a cold
  // Jest cache, unlike the lightweight profile-selection fixtures.
  expect(
    await screen.findByTestId('overview-content', {}, { timeout: 30000 }),
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
}, 60000);
