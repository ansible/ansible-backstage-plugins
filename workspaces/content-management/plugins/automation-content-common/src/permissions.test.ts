import {
  automationContentSyncPermission,
  automationContentViewPermission,
} from './permissions';

it('defines manual sync as a distinct basic update permission', () => {
  expect(automationContentSyncPermission).toEqual({
    type: 'basic',
    name: 'ansible.content.sync',
    attributes: { action: 'update' },
  });
  expect(automationContentViewPermission.name).toBe('ansible.content.view');
  expect(automationContentViewPermission.attributes).toEqual({});
});
