import type { AppProfileMenuItemDescriptor } from '@ansible/portal-extension-api/alpha';
import { collectAppProfileMenuItems } from './appProfileMenuItems';

const navigation: AppProfileMenuItemDescriptor = {
  id: 'app-profile-menu-item:preferences/page',
  ownerPlugin: 'preferences',
  title: 'Preferences',
  type: 'navigation',
  targetPage: 'page:preferences/settings',
  authorization: { type: 'authenticated' },
};
it('accepts, deduplicates and orders owned declarations without loading actions', () => {
  const loadAction = jest.fn();
  const action: AppProfileMenuItemDescriptor = {
    ...navigation,
    id: 'app-profile-menu-item:preferences/action',
    type: 'action',
    order: -1,
    loadAction,
  };
  expect(collectAppProfileMenuItems([navigation, action, navigation])).toEqual([
    action,
    navigation,
  ]);
  expect(loadAction).not.toHaveBeenCalled();
});
it.each([
  { id: 'app-profile-menu-item:foreign/page' },
  { title: ' ' },
  { authorization: undefined },
  { authorization: { type: 'none' } },
  { authorization: { type: 'permission', requirement: {} } },
  { targetPage: 'page:foreign/settings' },
  { targetPage: '/untrusted' },
  { type: 'action', loadAction: undefined },
  { type: 'unknown' },
  { order: NaN },
  { enabledByConfig: '' },
  { enabledByConfig: 'broken key' },
])('rejects malformed declaration %j', invalid => {
  expect(
    collectAppProfileMenuItems([
      { ...navigation, ...invalid } as AppProfileMenuItemDescriptor,
    ]),
  ).toEqual([]);
});
