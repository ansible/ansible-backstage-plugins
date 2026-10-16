import { createElement } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  PageBlueprint,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { compatWrapper } from '@backstage/core-compat-api';
import {
  portalContributionsApiRef,
  type CatalogHeaderActionDescriptor,
} from '@ansible/portal-extension-api/alpha';
import {
  createPermission,
  AuthorizeResult,
} from '@backstage/plugin-permission-common';
import { NativeCatalogHeaderActions } from './NativeCatalogHeaderActions';
import {
  collectCatalogHeaderActions,
  collectScaffolderWorkflows,
} from './catalogHeaderActions';

const workflow = {
  ownerPlugin: 'contributor',
  workflowId: 'contributor.register',
  templateRef: 'template:default/register-repository',
};
const action: CatalogHeaderActionDescriptor = {
  attachment: 'catalog.header.actions',
  capabilityId: 'contributor.lifecycle',
  entryPointId: 'contributor.add',
  manifest: {
    id: 'contributor',
    version: '1.0.0',
    apiVersion: '0.1.0',
    entitlements: [],
    capabilities: [
      {
        id: 'contributor.lifecycle',
        ownerPlugin: 'contributor',
        experienceId: 'content-authoring',
        displayName: 'Lifecycle',
        description: 'Register content',
        minimumHostApiVersion: '0.1.0',
        appliesToContentTypes: ['playbook-repository'],
        entryPoints: [
          {
            id: 'contributor.add',
            kind: 'entity-action',
            surface: 'experience-slot',
            label: 'Add repository',
            appliesToContentTypes: ['playbook-repository'],
            launches: { type: 'workflow', workflowId: 'contributor.register' },
            requiredPermission: createPermission({
              name: 'contributor.register',
              attributes: { action: 'create' },
            }),
          },
        ],
      },
    ],
  },
};
it('resolves a namespaced workflow through a catalog identity, not a URL', () => {
  expect(collectScaffolderWorkflows([workflow])).toEqual([workflow]);
  expect(collectCatalogHeaderActions([action], [workflow])).toEqual([action]);
});
it.each([
  'https://evil.test/template',
  'component:default/repo',
  'template:default/../../bad',
])('rejects an unsafe workflow template %s', templateRef => {
  expect(collectScaffolderWorkflows([{ ...workflow, templateRef }])).toEqual(
    [],
  );
});
it('rejects missing, foreign-owned and duplicate workflows/actions', () => {
  expect(
    collectCatalogHeaderActions(
      [{} as CatalogHeaderActionDescriptor, action],
      [workflow],
    ),
  ).toEqual([action]);
  expect(collectCatalogHeaderActions([action], [])).toEqual([]);
  expect(
    collectCatalogHeaderActions(
      [action],
      [{ ...workflow, ownerPlugin: 'other' }],
    ),
  ).toEqual([]);
  expect(collectScaffolderWorkflows([workflow, workflow])).toEqual([workflow]);
  expect(collectCatalogHeaderActions([action, action], [workflow])).toEqual([
    action,
  ]);
  expect(
    collectScaffolderWorkflows([{ ...workflow, workflowId: 'other.register' }]),
  ).toEqual([]);
});
it('rejects launches without a permission or outside their capability scope', () => {
  const clone = {
    ...action,
    manifest: {
      ...action.manifest,
      capabilities: action.manifest.capabilities.map(capability => ({
        ...capability,
        entryPoints: capability.entryPoints.map(entry => ({
          ...entry,
          requiredPermission: undefined,
        })),
      })),
    },
  };
  expect(collectCatalogHeaderActions([clone], [workflow])).toEqual([]);
  clone.manifest.capabilities[0].entryPoints[0].appliesToContentTypes = [
    'collection',
  ];
  expect(collectCatalogHeaderActions([clone], [workflow])).toEqual([]);
});

it.each([
  [true, AuthorizeResult.ALLOW, 'playbook-repository', true],
  [true, AuthorizeResult.DENY, 'playbook-repository', false],
  [false, AuthorizeResult.ALLOW, 'playbook-repository', false],
  [true, AuthorizeResult.ALLOW, 'collection', false],
])(
  'gates catalog workflow enabled=%s decision=%s type=%s',
  async (enabled, decision, contentType, visible) => {
    const authorize = jest.fn(() => decision);
    const page = PageBlueprint.make({
      params: {
        path: '/header',
        loader: async () =>
          compatWrapper(
            createElement(
              'div',
              null,
              createElement(NativeCatalogHeaderActions, {
                contentType,
                templatePath: (namespace, name) =>
                  `/templates/${namespace}/${name}`,
              }),
              createElement('p', null, 'Catalog ready'),
            ),
          ),
      },
    });
    await renderTestApp({
      features: [
        createFrontendPlugin({ pluginId: 'portal', extensions: [page] }),
      ],
      initialRouteEntries: ['/header'],
      config: { contributor: { enabled } },
      apis: [
        [
          portalContributionsApiRef,
          {
            tabs: [],
            cards: [],
            actions: [],
            catalogActions: [],
            catalogHeaderActions: [
              { ...action, enabledByConfig: 'contributor.enabled' },
            ],
            scaffolderWorkflows: [workflow],
          },
        ],
        mockApis.permission({ authorize }),
      ],
    });
    await screen.findByText('Catalog ready');
    await waitFor(() =>
      expect(authorize).toHaveBeenCalledTimes(
        enabled && contentType === 'playbook-repository' ? 1 : 0,
      ),
    );
    await waitFor(() =>
      expect(
        screen
          .queryByRole('button', { name: 'Add repository' })
          ?.getAttribute('href'),
      ).toBe(visible ? '/templates/default/register-repository' : undefined),
    );
  },
);
