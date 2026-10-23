import { screen, waitFor } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  createFrontendModule,
  createFrontendPlugin,
  createRouteRef,
  AppRootElementBlueprint,
  PageBlueprint,
  createExtension,
} from '@backstage/frontend-plugin-api';
import {
  AppHeaderActionBlueprint,
  appHeaderActionDataRef,
  PORTAL_CONTRIBUTIONS_ATTACHMENT,
  type ResolvedAppHeaderAction,
} from '@ansible/portal-extension-api/alpha';
import {
  createPortalContributionProvider,
  createPortalScaffolderPage,
} from '@ansible/portal-extension-host/alpha';
import { NativeGlobalHeader } from './NativeGlobalHeader';

const permission = {
  type: 'basic' as const,
  name: 'test.templates',
  attributes: { action: 'read' as const },
};

jest.mock('./GlobalHeader', () => ({
  GlobalHeader: ({
    createActions = [],
  }: {
    createActions?: readonly ResolvedAppHeaderAction[];
  }) => (
    <>
      {createActions.map(action => (
        <a key={action.id} href={action.path}>
          {action.title}
        </a>
      ))}
    </>
  ),
}));

const host = createFrontendPlugin({
  pluginId: 'portal',
  extensions: [createPortalContributionProvider()],
});
const header = createFrontendModule({
  pluginId: 'app',
  extensions: [
    AppRootElementBlueprint.make({
      name: 'header-under-test',
      params: { element: <NativeGlobalHeader /> },
    }),
  ],
});
const templates = createFrontendPlugin({
  pluginId: 'portal-scaffolder',
  extensions: [
    AppHeaderActionBlueprint.make({
      name: 'templates',
      params: {
        group: 'create',
        title: 'Create destination',
        targetPage: 'page:portal-scaffolder/templates',
        requiredPermission: permission,
      },
    }),
    createPortalScaffolderPage({
      path: '/self-service',
      routeRef: createRouteRef(),
      loader: async () => <div>Templates destination</div>,
    }),
  ],
});

function independentPlugin(
  pluginId: string,
  order = 0,
  targetPage = `page:${pluginId}/editor`,
) {
  return createFrontendPlugin({
    pluginId,
    extensions: [
      AppHeaderActionBlueprint.make({
        name: 'create',
        params: {
          group: 'create',
          title: `Create ${pluginId}`,
          targetPage,
          requiredPermission: permission,
          order,
          enabledByConfig: `ansible.${pluginId}.enabled`,
        },
      }),
      PageBlueprint.make({
        name: 'editor',
        params: {
          path: `/${pluginId}`,
          title: pluginId,
          loader: async () => <div>{pluginId} page</div>,
        },
      }),
    ],
  });
}

it('discovers an independent plugin without scaffolder and follows its effective page path', async () => {
  await renderTestApp({
    features: [host, header, independentPlugin('content')],
    apis: [mockApis.permission()],
    config: {
      ansible: { content: { enabled: true } },
      app: {
        extensions: [
          { 'page:content/editor': { config: { path: '/renamed-content' } } },
        ],
      },
    },
    initialRouteEntries: ['/renamed-content'],
  });
  expect(
    await screen.findByRole('link', { name: 'Create content' }),
  ).toHaveAttribute('href', '/renamed-content');
  expect(
    screen.queryByRole('link', { name: 'Create destination' }),
  ).not.toBeInTheDocument();
});

it('sorts multiple independently declared destinations without loading inactive pages', async () => {
  await renderTestApp({
    features: [host, header, templates, independentPlugin('content', -10)],
    apis: [mockApis.permission()],
    config: { ansible: { content: { enabled: true } } },
    initialRouteEntries: ['/self-service'],
  });
  await screen.findByRole('link', { name: 'Create content' });
  await waitFor(() =>
    expect(
      screen
        .getAllByRole('link')
        .filter(link => link.textContent?.startsWith('Create'))
        .map(link => link.textContent),
    ).toEqual(['Create content', 'Create destination']),
  );
  expect(screen.queryByText('content page')).not.toBeInTheDocument();
});

it.each([
  { disabled: 'page:content/editor', enabled: true },
  { disabled: 'app-header-action:content/create', enabled: true },
  { disabled: undefined, enabled: false },
])(
  'omits disabled pages, disabled declarations, and config-disabled contributors: %j',
  async ({ disabled, enabled }) => {
    await renderTestApp({
      features: [host, header, templates, independentPlugin('content')],
      apis: [mockApis.permission()],
      config: {
        ansible: { content: { enabled } },
        app: { extensions: disabled ? [{ [disabled]: false }] : [] },
      },
      initialRouteEntries: ['/self-service'],
    });
    await screen.findByRole('link', { name: 'Create destination' });
    expect(
      screen.queryByRole('link', { name: 'Create content' }),
    ).not.toBeInTheDocument();
  },
);

it('fails closed on permission denial without loading the destination', async () => {
  const authorize = jest.fn(() => 'DENY' as const);
  await renderTestApp({
    features: [host, header, independentPlugin('content')],
    apis: [mockApis.permission({ authorize })],
    config: { ansible: { content: { enabled: true } } },
    initialRouteEntries: ['/'],
  });
  await waitFor(() => expect(authorize).toHaveBeenCalled());
  expect(
    screen.queryByRole('link', { name: 'Create content' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('content page')).not.toBeInTheDocument();
});

it('rejects a contributor claiming another plugin page while retaining a healthy action', async () => {
  await renderTestApp({
    features: [
      host,
      header,
      templates,
      independentPlugin('content', 0, 'page:portal-scaffolder/templates'),
    ],
    apis: [mockApis.permission()],
    config: { ansible: { content: { enabled: true } } },
    initialRouteEntries: ['/self-service'],
  });
  await screen.findByRole('link', { name: 'Create destination' });
  expect(
    screen.queryByRole('link', { name: 'Create content' }),
  ).not.toBeInTheDocument();
});

it('binds forged descriptor identity to the actual NFS contributor before validation', async () => {
  const forged = createFrontendPlugin({
    pluginId: 'forged',
    extensions: [
      createExtension({
        kind: 'app-header-action',
        name: 'create',
        attachTo: {
          id: PORTAL_CONTRIBUTIONS_ATTACHMENT,
          input: 'appHeaderActions',
        },
        output: [appHeaderActionDataRef],
        factory: () => [
          appHeaderActionDataRef({
            id: 'app-header-action:portal-scaffolder/forged',
            ownerPlugin: 'portal-scaffolder',
            group: 'create',
            title: 'Forged action',
            targetPage: 'page:portal-scaffolder/templates',
            requiredPermission: permission,
          }),
        ],
      }),
    ],
  });
  await renderTestApp({
    features: [host, header, templates, forged],
    apis: [mockApis.permission()],
    initialRouteEntries: ['/self-service'],
  });
  await screen.findByRole('link', { name: 'Create destination' });
  expect(
    screen.queryByRole('link', { name: 'Forged action' }),
  ).not.toBeInTheDocument();
});

it('exposes Create for the real named Templates adapter in an assembled NFS app', async () => {
  await renderTestApp({
    features: [host, header, templates],
    apis: [mockApis.permission()],
    initialRouteEntries: ['/self-service'],
  });
  expect(await screen.findByText('Templates destination')).toBeInTheDocument();
  expect(
    await screen.findByRole('link', { name: 'Create destination' }),
  ).toHaveAttribute('href', '/self-service');
});
