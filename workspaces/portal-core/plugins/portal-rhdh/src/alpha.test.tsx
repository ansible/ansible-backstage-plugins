import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  createExtensionInput,
  createFrontendModule,
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
import {
  globalHeaderComponentDataRef,
  globalHeaderMenuItemDataRef,
} from '@red-hat-developer-hub/backstage-plugin-global-header';
import {
  AppHeaderActionBlueprint,
  AppProfileMenuItemBlueprint,
} from '@ansible/portal-extension-api/alpha';
import { createPortalContributionProvider } from '@ansible/portal-extension-host/alpha';
import portalRhdh from './alpha';

jest.mock(
  '@ansible/aap-app-auth',
  () => {
    throw new Error('The RHDH adapter must not import an AAP implementation');
  },
  { virtual: true },
);

// Exercise the real public Blueprint attachment/data refs without unrelated header widgets.
const headerHost = createFrontendModule({
  pluginId: 'app',
  extensions: [
    AppRootWrapperBlueprint.makeWithOverrides({
      name: 'global-header',
      inputs: {
        components: createExtensionInput([globalHeaderComponentDataRef]),
        menuItems: createExtensionInput([globalHeaderMenuItemDataRef]),
      },
      factory(originalFactory, { inputs }) {
        const components = inputs.components.map(input =>
          input.get(globalHeaderComponentDataRef),
        );
        const menuItems = inputs.menuItems.map(input =>
          input.get(globalHeaderMenuItemDataRef),
        );
        return originalFactory({
          component: ({ children }) => (
            <>
              <div role="toolbar">
                {components.map(({ component: Component }, i) => (
                  <Component key={i} />
                ))}
              </div>
              <div role="menu" aria-label="Profile">
                {menuItems
                  .filter(item => item.target === 'profile')
                  .map(({ component: Component }, i) =>
                    Component ? <Component key={i} /> : null,
                  )}
              </div>
              {children}
            </>
          ),
        });
      },
    }),
  ],
});
const host = createFrontendPlugin({
  pluginId: 'portal',
  extensions: [createPortalContributionProvider()],
});
const permission = {
  type: 'basic' as const,
  name: 'test.create',
  attributes: { action: 'read' as const },
};
function contributor(id: string) {
  return createFrontendPlugin({
    pluginId: id,
    extensions: [
      PageBlueprint.make({
        name: 'create',
        params: {
          path: `/${id}`,
          loader: async () => <div>{id} destination</div>,
        },
      }),
      AppHeaderActionBlueprint.make({
        name: 'create',
        params: {
          group: 'create',
          title: `Create ${id}`,
          targetPage: `page:${id}/create`,
          requiredPermission: permission,
        },
      }),
    ],
  });
}

it('registers generic native header attachments without AAP dependencies', () => {
  const extensions = (
    portalRhdh as unknown as {
      extensions: Array<{ id: string; disabled: boolean }>;
    }
  ).extensions;
  expect(extensions.map(e => e.id)).toEqual([
    'gh-component:portal-rhdh/create',
    'gh-menu-item:portal-rhdh/profile',
  ]);
});

it('renders nothing without eligible actions and does not require AAP authentication', async () => {
  await renderTestApp({ features: [headerHost, host, portalRhdh] });
  expect(
    screen.queryByRole('button', { name: 'Create...' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('menuitem', { name: 'Sign out' }),
  ).not.toBeInTheDocument();
});

it('uses an independent plugin declaration and follows its effective installed route', async () => {
  await renderTestApp({
    features: [headerHost, host, portalRhdh, contributor('editor')],
    apis: [mockApis.permission()],
    config: {
      app: {
        extensions: [
          { 'page:editor/create': { config: { path: '/new-editor' } } },
        ],
      },
    },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Create...' }));
  expect(await screen.findByText('editor destination')).toBeInTheDocument();
});

it('shows a menu for multiple independently contributed destinations', async () => {
  await renderTestApp({
    features: [
      headerHost,
      host,
      portalRhdh,
      contributor('editor'),
      contributor('builder'),
    ],
    apis: [mockApis.permission()],
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Create...' }));
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Create builder' }),
  );
  expect(await screen.findByText('builder destination')).toBeInTheDocument();
});

it('omits a disabled destination without loading a plugin-specific fallback', async () => {
  await renderTestApp({
    features: [headerHost, host, portalRhdh, contributor('editor')],
    apis: [mockApis.permission()],
    config: { app: { extensions: [{ 'page:editor/create': false }] } },
  });
  expect(
    screen.queryByRole('button', { name: 'Create...' }),
  ).not.toBeInTheDocument();
});

it('renders and invokes an independent UI action without importing an AAP implementation', async () => {
  const activate = jest.fn();
  const loadAction = jest.fn(async () => activate);
  const independent = createFrontendPlugin({
    pluginId: 'preferences',
    extensions: [
      AppProfileMenuItemBlueprint.make({
        name: 'open',
        params: {
          type: 'action',
          title: 'Open preferences',
          authorization: { type: 'authenticated' },
          loadAction,
        },
      }),
    ],
  });
  await renderTestApp({
    features: [headerHost, host, portalRhdh, independent],
    apis: [mockApis.identity()],
  });
  const item = await screen.findByRole('menuitem', {
    name: 'Open preferences',
  });
  expect(loadAction).not.toHaveBeenCalled();
  fireEvent.click(item);
  await screen.findByRole('menuitem', { name: 'Open preferences' });
  await waitFor(() => expect(activate).toHaveBeenCalled());
});

it('follows a profile destination using the declaring plugin effective page path', async () => {
  const profile = createFrontendModule({
    pluginId: 'editor',
    extensions: [
      AppProfileMenuItemBlueprint.make({
        name: 'preferences',
        params: {
          type: 'navigation',
          title: 'Editor preferences',
          targetPage: 'page:editor/create',
          authorization: { type: 'authenticated' },
        },
      }),
    ],
  });
  await renderTestApp({
    features: [headerHost, host, portalRhdh, contributor('editor'), profile],
    apis: [mockApis.identity(), mockApis.permission()],
    config: {
      app: {
        extensions: [
          { 'page:editor/create': { config: { path: '/renamed-editor' } } },
        ],
      },
    },
  });
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Editor preferences' }),
  );
  expect(await screen.findByText('editor destination')).toBeInTheDocument();
});

it('does not load a permission-denied profile action', async () => {
  const loadAction = jest.fn();
  const authorize = jest.fn(() => 'DENY' as const);
  const profile = createFrontendPlugin({
    pluginId: 'restricted',
    extensions: [
      AppProfileMenuItemBlueprint.make({
        name: 'preferences',
        params: {
          type: 'action',
          title: 'Restricted preferences',
          loadAction,
          authorization: { type: 'permission', requirement: permission },
        },
      }),
    ],
  });
  await renderTestApp({
    features: [headerHost, host, portalRhdh, profile],
    apis: [mockApis.identity(), mockApis.permission({ authorize })],
  });
  await waitFor(() => expect(authorize).toHaveBeenCalled());
  expect(
    screen.queryByRole('menuitem', { name: 'Restricted preferences' }),
  ).not.toBeInTheDocument();
  expect(loadAction).not.toHaveBeenCalled();
});

it('omits a native-disabled profile declaration without invoking its loader', async () => {
  const loadAction = jest.fn();
  const profile = createFrontendPlugin({
    pluginId: 'preferences',
    extensions: [
      AppProfileMenuItemBlueprint.make({
        name: 'open',
        params: {
          type: 'action',
          title: 'Preferences',
          loadAction,
          authorization: { type: 'authenticated' },
        },
      }),
    ],
  });
  await renderTestApp({
    features: [headerHost, host, portalRhdh, profile],
    apis: [mockApis.identity()],
    config: {
      app: {
        extensions: [{ 'app-profile-menu-item:preferences/open': false }],
      },
    },
  });
  expect(
    screen.queryByRole('menuitem', { name: 'Preferences' }),
  ).not.toBeInTheDocument();
  expect(loadAction).not.toHaveBeenCalled();
});
