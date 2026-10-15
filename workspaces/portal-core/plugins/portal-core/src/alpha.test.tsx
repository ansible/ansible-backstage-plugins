import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import portalPlugin from './alpha';

const templates = createFrontendPlugin({
  pluginId: 'portal-scaffolder',
  extensions: [
    PageBlueprint.make({
      params: {
        path: '/self-service',
        loader: async () => <div>Templates landing</div>,
      },
    }),
  ],
});

it('keeps the contribution APIs without a duplicate Portal catalog or entity UI', () => {
  const extensions = (
    portalPlugin as unknown as { extensions: Array<{ id: string }> }
  ).extensions;
  expect(extensions.map(extension => extension.id)).toEqual([
    'app-root-element:portal/theme-baseline',
    'page:portal/landing',
    'api:portal/contributions',
    'api:portal/operations',
    'api:portal/entitlements',
  ]);
});

it('routes the app root to Templates with no Portal content sidebar entry', async () => {
  await renderTestApp({
    features: [portalPlugin, templates],
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Templates landing')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Portal content' })).toBeNull();
});

it.each([
  '/portal/catalog',
  '/portal/entity/default/component/repo',
  '/portal/start',
])('does not register the removed route %s', async path => {
  await renderTestApp({
    features: [portalPlugin, templates],
    initialRouteEntries: [path],
  });
  expect(await screen.findByText(/404/)).toBeTruthy();
  expect(screen.queryByText('Templates landing')).toBeNull();
});
