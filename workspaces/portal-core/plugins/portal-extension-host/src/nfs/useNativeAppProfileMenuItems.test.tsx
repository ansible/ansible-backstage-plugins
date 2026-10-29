import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useApi,
  useApiHolder,
  configApiRef,
} from '@backstage/frontend-plugin-api';
import { identityApiRef } from '@backstage/core-plugin-api';
import { MockConfigApi } from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  portalContributionsApiRef,
  type AppProfileMenuItemDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { useNativeAppProfileMenuItems } from './useNativeAppProfileMenuItems';

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useApi: jest.fn(),
  useApiHolder: jest.fn(),
}));
const run = jest.fn();
const loadAction = jest.fn(async () => run);
const identity = jest.fn();
const authorize = jest.fn();
const apis = new Map<string, unknown>();
const holder = { get: (ref: { id: string }) => apis.get(ref.id) as never };
const item: AppProfileMenuItemDescriptor = {
  id: 'app-profile-menu-item:preferences/open',
  ownerPlugin: 'preferences',
  type: 'action',
  title: 'Preferences',
  authorization: { type: 'authenticated' },
  loadAction,
};
const getData = jest.fn();
const tree = {
  getTree: () => ({
    tree: {
      nodes: new Map([
        [
          'page:preferences/settings',
          {
            spec: { plugin: { id: 'preferences' } },
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
  loadAction.mockImplementation(async () => run);
  getData.mockReturnValue('/preferences');
  identity.mockResolvedValue({
    type: 'user',
    userEntityRef: 'user:default/test',
  });
  authorize.mockResolvedValue({ result: AuthorizeResult.ALLOW });
  apis.set(portalContributionsApiRef.id, { appProfileMenuItems: [item] });
  apis.set(identityApiRef.id, { getBackstageIdentity: identity });
  apis.set(configApiRef.id, new MockConfigApi({}));
  apis.set(permissionApiRef.id, { authorize });
  jest.mocked(useApi).mockReturnValue(tree);
  jest.mocked(useApiHolder).mockReturnValue(holder);
});

it('keeps code lazy and supplies the host API holder on deliberate activation', async () => {
  const { result } = renderHook(useNativeAppProfileMenuItems);
  expect(result.current).toEqual([]);
  await waitFor(() => expect(result.current).toHaveLength(1));
  expect(loadAction).not.toHaveBeenCalled();
  const action = result.current[0];
  if (action.type !== 'action') throw new Error('Expected action');
  const closeMenu = jest.fn();
  await action.activate(closeMenu);
  expect(closeMenu.mock.invocationCallOrder[0]).toBeLessThan(
    run.mock.invocationCallOrder[0],
  );
  expect(run).toHaveBeenCalledWith({ apis: holder });
});

it.each([
  'provider',
  'identity-api',
  'anonymous',
  'identity-error',
  'denied',
  'conditional',
  'permission-api',
  'permission-error',
  'config',
  'config-error',
  'path',
])('fails closed before loading for %s', async mode => {
  if (mode === 'provider') apis.delete(portalContributionsApiRef.id);
  if (mode === 'identity-api') apis.delete(identityApiRef.id);
  if (mode === 'anonymous') identity.mockResolvedValue(undefined);
  if (mode === 'identity-error')
    identity.mockRejectedValue(new Error('Unavailable'));
  if (mode === 'denied')
    authorize.mockResolvedValue({ result: AuthorizeResult.DENY });
  if (mode === 'conditional')
    authorize.mockResolvedValue({ result: AuthorizeResult.CONDITIONAL });
  if (mode === 'permission-error')
    authorize.mockRejectedValue(new Error('Unavailable'));
  if (mode === 'permission-api') apis.delete(permissionApiRef.id);
  if (
    ['denied', 'conditional', 'permission-error', 'permission-api'].includes(
      mode,
    )
  )
    apis.set(portalContributionsApiRef.id, {
      appProfileMenuItems: [
        {
          ...item,
          authorization: {
            type: 'permission',
            requirement: {
              type: 'basic',
              name: 'preferences.view',
              attributes: {},
            },
          },
        },
      ],
    });
  if (mode.startsWith('config')) {
    apis.set(portalContributionsApiRef.id, {
      appProfileMenuItems: [
        { ...item, enabledByConfig: 'preferences.enabled' },
      ],
    });
    if (mode === 'config-error')
      apis.set(
        configApiRef.id,
        new MockConfigApi({ preferences: { enabled: 'invalid' } }),
      );
  }
  if (mode === 'path')
    apis.set(portalContributionsApiRef.id, {
      appProfileMenuItems: [
        { ...item, type: 'navigation', targetPage: 'page:preferences/missing' },
      ],
    });
  const { result } = renderHook(useNativeAppProfileMenuItems);
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current).toEqual([]);
  expect(loadAction).not.toHaveBeenCalled();
});

it('resolves an owned navigation destination without loading action code', async () => {
  apis.set(portalContributionsApiRef.id, {
    appProfileMenuItems: [
      { ...item, type: 'navigation', targetPage: 'page:preferences/settings' },
    ],
  });
  const { result } = renderHook(useNativeAppProfileMenuItems);
  await waitFor(() =>
    expect(result.current[0]).toEqual({
      id: item.id,
      title: item.title,
      type: 'navigation',
      path: '/preferences',
    }),
  );
});

it('rechecks identity before loading an action', async () => {
  const { result } = renderHook(useNativeAppProfileMenuItems);
  await waitFor(() => expect(result.current).toHaveLength(1));
  identity.mockResolvedValue(undefined);
  const action = result.current[0];
  if (action.type !== 'action') throw new Error('Expected action');
  await expect(action.activate()).rejects.toThrow('no longer available');
  expect(loadAction).not.toHaveBeenCalled();
});

it('contains obsolete resolution and does not invoke code loaded after unmount', async () => {
  let finish!: (value: typeof run) => void;
  loadAction.mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve;
    }),
  );
  const { result, unmount } = renderHook(useNativeAppProfileMenuItems);
  await waitFor(() => expect(result.current).toHaveLength(1));
  const action = result.current[0];
  if (action.type !== 'action') throw new Error('Expected action');
  const activation = action.activate();
  await waitFor(() => expect(loadAction).toHaveBeenCalled());
  unmount();
  finish(run);
  await activation;
  expect(run).not.toHaveBeenCalled();
});

it('rejects loader failures without affecting other items', async () => {
  const { result } = renderHook(useNativeAppProfileMenuItems);
  await waitFor(() => expect(result.current).toHaveLength(1));
  loadAction.mockRejectedValueOnce(new Error('load failed'));
  const action = result.current[0];
  if (action.type !== 'action') throw new Error('Expected action');
  await expect(action.activate()).rejects.toThrow('load failed');
  expect(result.current).toHaveLength(1);
});

it('does not publish an obsolete identity result after contributions change', async () => {
  let resolve!: (value: { type: string; userEntityRef: string }) => void;
  identity.mockReturnValueOnce(
    new Promise(finish => {
      resolve = finish;
    }),
  );
  const { result, rerender } = renderHook(useNativeAppProfileMenuItems);
  await waitFor(() => expect(identity).toHaveBeenCalled());
  apis.set(portalContributionsApiRef.id, { appProfileMenuItems: [] });
  rerender();
  await act(async () => {
    resolve({ type: 'user', userEntityRef: 'user:default/test' });
  });
  expect(result.current).toEqual([]);
  expect(loadAction).not.toHaveBeenCalled();
});

it('rejects malformed lazy action results', async () => {
  const { result } = renderHook(useNativeAppProfileMenuItems);
  await waitFor(() => expect(result.current).toHaveLength(1));
  loadAction.mockResolvedValueOnce(undefined as never);
  const action = result.current[0];
  if (action.type !== 'action') throw new Error('Expected action');
  await expect(action.activate()).rejects.toThrow(
    'Invalid profile action implementation',
  );
});
