import {
  coreExtensionData,
  type AppTreeApi,
} from '@backstage/frontend-plugin-api';
import { resolveProfileMenuPath } from './profileMenuTargets';

const target = {
  ownerPlugin: 'independent',
  targetPage: 'page:independent/settings',
};

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
                    target.targetPage,
                    {
                      spec: {
                        id: target.targetPage,
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
  expect(resolveProfileMenuPath(target, api)).toBe('/renamed');
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
  expect(resolveProfileMenuPath(target, tree(options).api)).toBeUndefined();
});
