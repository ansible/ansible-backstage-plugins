import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useApi,
  useApiHolder,
  configApiRef,
} from '@backstage/frontend-plugin-api';
import { MockConfigApi } from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import {
  portalContributionsApiRef,
  type AppHeaderActionDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { useNativeAppHeaderActions } from './useNativeAppHeaderActions';

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useApi: jest.fn(),
  useApiHolder: jest.fn(),
}));

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
const authorize = jest.fn();
const apis = new Map<string, unknown>();
const getData = jest.fn();
const tree = {
  getTree: () => ({
    tree: {
      nodes: new Map([
        [
          action.targetPage,
          {
            spec: { id: action.targetPage, plugin: { id: action.ownerPlugin } },
            edges: {
              attachedTo: {
                node: { spec: { id: 'app/routes' } },
                input: 'routes',
              },
            },
            instance: { getData },
          },
        ],
      ]),
    },
  }),
};

beforeEach(() => {
  jest.clearAllMocks();
  apis.clear();
  getData.mockReturnValue('/independent');
  authorize.mockResolvedValue({ result: AuthorizeResult.ALLOW });
  apis.set(portalContributionsApiRef.id, { appHeaderActions: [action] });
  apis.set(permissionApiRef.id, { authorize });
  apis.set(configApiRef.id, new MockConfigApi({}));
  jest.mocked(useApi).mockReturnValue(tree);
  jest
    .mocked(useApiHolder)
    .mockReturnValue({ get: ref => apis.get(ref.id) as never });
});

it('starts hidden and exposes only an authorized effective destination', async () => {
  const { result } = renderHook(() => useNativeAppHeaderActions('create'));
  expect(result.current).toEqual([]);
  await waitFor(() =>
    expect(result.current).toEqual([
      { id: action.id, title: action.title, path: '/independent' },
    ]),
  );
  expect(authorize).toHaveBeenCalledWith({
    permission: action.requiredPermission,
  });
});

it.each([
  'provider',
  'permission-api',
  'deny',
  'conditional',
  'error',
  'missing-path',
  'config-missing',
  'config-false',
  'config-error',
])('fails closed for %s', async mode => {
  if (mode === 'provider') apis.delete(portalContributionsApiRef.id);
  if (mode === 'permission-api') apis.delete(permissionApiRef.id);
  if (mode === 'deny')
    authorize.mockResolvedValue({ result: AuthorizeResult.DENY });
  if (mode === 'conditional')
    authorize.mockResolvedValue({ result: AuthorizeResult.CONDITIONAL });
  if (mode === 'error') authorize.mockRejectedValue(new Error('Unavailable'));
  if (mode === 'missing-path') getData.mockReturnValue(undefined);
  if (mode.startsWith('config-')) {
    apis.set(portalContributionsApiRef.id, {
      appHeaderActions: [
        { ...action, enabledByConfig: 'ansible.independent.enabled' },
      ],
    });
    if (mode === 'config-missing') apis.delete(configApiRef.id);
    else
      apis.set(
        configApiRef.id,
        new MockConfigApi({
          ansible: {
            independent: {
              enabled: mode === 'config-error' ? 'invalid' : false,
            },
          },
        }),
      );
  }
  const { result } = renderHook(() => useNativeAppHeaderActions('create'));
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current).toEqual([]);
  expect(authorize).toHaveBeenCalledTimes(
    ['deny', 'conditional', 'error'].includes(mode) ? 1 : 0,
  );
});

it('preserves the resource reference for a scoped permission', async () => {
  const requiredPermission = {
    permission: createPermission({
      name: 'content.read',
      resourceType: 'content',
      attributes: { action: 'read' },
    }),
    resourceRef: 'content:default/new',
  };
  apis.set(portalContributionsApiRef.id, {
    appHeaderActions: [{ ...action, requiredPermission }],
  });
  const { result } = renderHook(() => useNativeAppHeaderActions('create'));
  await waitFor(() => expect(result.current).toHaveLength(1));
  expect(authorize).toHaveBeenCalledWith(requiredPermission);
});

it('does not publish an obsolete permission result after contributions change', async () => {
  let resolve!: (value: { result: AuthorizeResult.ALLOW }) => void;
  authorize.mockReturnValue(
    new Promise(value => {
      resolve = value;
    }),
  );
  const { result, rerender } = renderHook(() =>
    useNativeAppHeaderActions('create'),
  );
  await waitFor(() => expect(authorize).toHaveBeenCalled());
  apis.set(portalContributionsApiRef.id, { appHeaderActions: [] });
  rerender();
  await act(async () => {
    resolve({ result: AuthorizeResult.ALLOW });
  });
  expect(result.current).toEqual([]);
});
