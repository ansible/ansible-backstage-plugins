import { createExtensionTester } from '@backstage/frontend-test-utils';
import { TestApiRegistry, MockConfigApi } from '@backstage/test-utils';
import {
  identityApiRef,
  configApiRef,
  errorApiRef,
} from '@backstage/core-plugin-api';
import { appProfileMenuItemDataRef } from '@ansible/portal-extension-api/alpha';
import { createAapLogoutProfileItem, createAapProfileModule } from './profile';
import { rhAapAuthApiRef } from './api';

it('keeps the dynamic AAP declaration opt-in and offers an explicit source composition', () => {
  const module = createAapProfileModule() as unknown as {
    extensions: Array<{ disabled: boolean }>;
  };
  expect(module.extensions[0].disabled).toBe(true);
  expect(createAapProfileModule().pluginId).toBe('app');
});

it('owns a lazy authenticated logout action and rejects missing auth APIs', async () => {
  const item = createExtensionTester(createAapLogoutProfileItem(false)).get(
    appProfileMenuItemDataRef,
  );
  expect(item.authorization).toEqual({ type: 'authenticated' });
  expect(item.type).toBe('action');
  if (item.type !== 'action') throw new Error('Expected action');
  const action = await item.loadAction();
  await expect(action({ apis: TestApiRegistry.from() })).rejects.toThrow(
    'AAP logout APIs are unavailable',
  );
});

it('invokes the AAP-owned logout flow with injected APIs', async () => {
  const auth = { signOut: jest.fn().mockResolvedValue(undefined) };
  const identity = { signOut: jest.fn().mockResolvedValue(undefined) };
  const apis = TestApiRegistry.from(
    [rhAapAuthApiRef, auth],
    [identityApiRef, identity],
    [configApiRef, new MockConfigApi({})],
    [errorApiRef, { post: jest.fn() }],
  );
  const item = createExtensionTester(createAapLogoutProfileItem(false)).get(
    appProfileMenuItemDataRef,
  );
  if (item.type !== 'action') throw new Error('Expected action');
  await (
    await item.loadAction()
  )({ apis });
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  expect(identity.signOut).toHaveBeenCalledTimes(1);
});
