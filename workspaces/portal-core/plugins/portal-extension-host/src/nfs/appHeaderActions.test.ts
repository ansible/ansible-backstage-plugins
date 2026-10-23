import {
  coreExtensionData,
  type AppTreeApi,
} from '@backstage/frontend-plugin-api';
import { createPermission } from '@backstage/plugin-permission-common';
import type { AppHeaderActionDescriptor } from '@ansible/portal-extension-api/alpha';
import {
  collectAppHeaderActions,
  resolveAppHeaderActionPath,
} from './appHeaderActions';

const action: AppHeaderActionDescriptor = {
  id: 'app-header-action:independent/create',
  ownerPlugin: 'independent',
  group: 'create',
  title: 'New content',
  targetPage: 'page:independent/editor',
  requiredPermission: createPermission({
    name: 'content.create',
    attributes: { action: 'create' },
  }),
};

it('accepts owned actions and sorts by order then extension identity', () => {
  const early = {
    ...action,
    id: 'app-header-action:independent/early',
    order: -1,
  };
  const tied = { ...action, id: 'app-header-action:independent/another' };
  expect(collectAppHeaderActions([action, early, tied])).toEqual([
    early,
    tied,
    action,
  ]);
  expect(collectAppHeaderActions([action, action])).toEqual([action]);
});

it.each([
  { group: 'unknown' },
  { id: 'app-header-action:other/create' },
  { title: '' },
  { title: '  ' },
  { targetPage: 'https://example.org' },
  { targetPage: 'page:other/editor' },
  { targetPage: 'page:independent/editor?query=1' },
  { targetPage: 'page:independent/editor#fragment' },
  { requiredPermission: undefined },
  { requiredPermission: { name: '' } },
  {
    requiredPermission: {
      permission: action.requiredPermission,
      resourceRef: '',
    },
  },
  { requiredPermission: { name: 'content.read', resourceType: 'content' } },
  { enabledByConfig: '' },
  { enabledByConfig: false },
  { enabledByConfig: null },
  { enabledByConfig: 'ansible..enabled' },
  { order: NaN },
  { order: Infinity },
])('rejects malformed or unowned navigation metadata: %j', change => {
  expect(
    collectAppHeaderActions([
      { ...action, ...change } as AppHeaderActionDescriptor,
    ]),
  ).toEqual([]);
});

it('accepts an explicitly scoped resource permission and a plugin root page', () => {
  const scoped = {
    ...action,
    targetPage: 'page:independent',
    enabledByConfig: 'ansible.independent.enabled',
    requiredPermission: {
      permission: createPermission({
        name: 'content.read',
        resourceType: 'content',
        attributes: { action: 'read' },
      }),
      resourceRef: 'content:default/new',
    },
  };
  expect(collectAppHeaderActions([scoped])).toEqual([scoped]);
});

function tree({
  path = '/renamed',
  disabled = false,
  owner = 'independent',
  parent = 'app/routes',
  input = 'routes',
  detached = false,
  mounted = true,
  missing = false,
} = {}) {
  const getData = jest.fn(ref =>
    ref === coreExtensionData.routePath ? path : undefined,
  );
  return {
    getData,
    api: {
      getTree: () => ({
        tree: {
          nodes: new Map(
            missing
              ? []
              : [
                  [
                    action.targetPage,
                    {
                      spec: {
                        id: action.targetPage,
                        disabled,
                        plugin: { id: owner },
                      },
                      edges: {
                        attachedTo: detached
                          ? undefined
                          : { node: { spec: { id: parent } }, input },
                      },
                      instance: mounted ? { getData } : undefined,
                    },
                  ],
                ],
          ),
        },
      }),
    } as unknown as AppTreeApi,
  };
}

it('resolves effective route metadata without loading the target component', () => {
  const { api, getData } = tree();
  expect(resolveAppHeaderActionPath(action, api)).toBe('/renamed');
  expect(getData).toHaveBeenCalledWith(coreExtensionData.routePath);
});

it.each([
  { disabled: true },
  { owner: 'other' },
  { parent: 'app' },
  { input: 'elements' },
  { detached: true },
  { mounted: false },
  { missing: true },
  { path: '' },
  { path: '/' },
  { path: '//other' },
  { path: '/a/../b' },
  { path: '/%2fother' },
  { path: '/a?x=1' },
  { path: '/a#x' },
  { path: '/a/' },
])('does not resolve unavailable or unsafe targets: %j', options => {
  expect(resolveAppHeaderActionPath(action, tree(options).api)).toBeUndefined();
});
