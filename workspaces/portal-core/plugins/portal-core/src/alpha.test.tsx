import { screen } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { RequirePermission } from '@backstage/plugin-permission-react';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
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

const otherPlugin = createFrontendPlugin({
  pluginId: 'independent',
  extensions: [
    PageBlueprint.make({
      params: {
        path: '/independent',
        loader: async () => <div>Independent destination</div>,
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

it('shows the host fallback without portal-scaffolder installed', async () => {
  await renderTestApp({
    features: [portalPlugin],
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Welcome to Automation Portal')).toBeTruthy();
  const icon = screen.getByRole('img', { name: 'Automation Portal' });
  expect(icon.getAttribute('src')).toBeTruthy();
  expect(icon.getAttribute('width')).toBe('48');
  expect(icon.getAttribute('height')).toBe('48');
  expect(screen.queryByText(/404/)).toBeNull();
});

it('uses a configured installed page without portal-scaffolder', async () => {
  await renderTestApp({
    features: [portalPlugin, otherPlugin],
    config: { portal: { landingPage: '/independent' } },
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Independent destination')).toBeTruthy();
});

it('prefers the configured page over the default Templates page', async () => {
  await renderTestApp({
    features: [portalPlugin, templates, otherPlugin],
    config: { portal: { landingPage: '/independent' } },
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Independent destination')).toBeTruthy();
  expect(screen.queryByText('Templates landing')).toBeNull();
});

it.each([
  '/missing',
  '/',
  '//example.com',
  'https://example.com',
  '/independent/missing',
  '/independent?next=//example.com',
])(
  'shows a safe fallback for invalid or unavailable destination %s',
  async landingPage => {
    await renderTestApp({
      features: [portalPlugin, templates, otherPlugin],
      config: { portal: { landingPage } },
      initialRouteEntries: ['/'],
    });
    expect(
      await screen.findByText('Welcome to Automation Portal'),
    ).toBeTruthy();
    expect(screen.queryByText('Templates landing')).toBeNull();
    expect(screen.queryByText('Independent destination')).toBeNull();
  },
);

it('does not redirect to a disabled page', async () => {
  await renderTestApp({
    features: [portalPlugin, templates],
    config: { app: { extensions: [{ 'page:portal-scaffolder': false }] } },
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Welcome to Automation Portal')).toBeTruthy();
});

it('uses the effective page path after an NFS path override', async () => {
  await renderTestApp({
    features: [portalPlugin, templates],
    config: {
      portal: { landingPage: '/templates' },
      app: {
        extensions: [
          { 'page:portal-scaffolder': { config: { path: '/templates' } } },
        ],
      },
    },
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Templates landing')).toBeTruthy();
});

it('does not treat the old default path as installed after its page is moved', async () => {
  await renderTestApp({
    features: [portalPlugin, templates],
    config: {
      app: {
        extensions: [
          { 'page:portal-scaffolder': { config: { path: '/templates' } } },
        ],
      },
    },
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Welcome to Automation Portal')).toBeTruthy();
  expect(screen.queryByText('Templates landing')).toBeNull();
});

it('does not load an unrelated installed page to decide the fallback', async () => {
  const loader = jest.fn(async () => <div>Unused destination</div>);
  const unused = createFrontendPlugin({
    pluginId: 'unused',
    extensions: [PageBlueprint.make({ params: { path: '/unused', loader } })],
  });
  await renderTestApp({
    features: [portalPlugin, unused],
    config: { portal: { landingPage: '/missing' } },
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Welcome to Automation Portal')).toBeTruthy();
  expect(loader).not.toHaveBeenCalled();
});

it('preserves the destination permission boundary', async () => {
  const permission = createPermission({
    name: 'portal.landing-test.view',
    attributes: { action: 'read' },
  });
  const restricted = createFrontendPlugin({
    pluginId: 'restricted',
    extensions: [
      PageBlueprint.make({
        params: {
          path: '/restricted',
          loader: async () => (
            <RequirePermission
              permission={permission}
              errorPage={<div>Access denied</div>}
            >
              <div>Restricted content</div>
            </RequirePermission>
          ),
        },
      }),
    ],
  });
  await renderTestApp({
    features: [portalPlugin, restricted],
    config: { portal: { landingPage: '/restricted' } },
    apis: [mockApis.permission({ authorize: AuthorizeResult.DENY })],
    initialRouteEntries: ['/'],
  });
  expect(await screen.findByText('Access denied')).toBeTruthy();
  expect(screen.queryByText('Restricted content')).toBeNull();
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
