import { createBackendModule } from '@backstage/backend-plugin-api';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import {
  ansibleSettingsEditPermission,
  ansibleSettingsViewPermission,
} from '@ansible/backstage-rhaap-common/permissions';
import { ansibleSettingsCapabilitiesExtensionPoint } from '@ansible/backstage-rhaap-common/permissions/extensionPoint';
import { catalogModuleAnsibleSettingsPermissions } from './module';

describe('catalogModuleAnsibleSettingsPermissions', () => {
  it('registers resource type when a capability is added', async () => {
    const permissionsRegistryMock = mockServices.permissionsRegistry.mock();

    const fakeConsumer = createBackendModule({
      pluginId: 'catalog',
      moduleId: 'fake-consumer',
      register(reg) {
        reg.registerInit({
          deps: {
            settingsCapabilities: ansibleSettingsCapabilitiesExtensionPoint,
          },
          async init({ settingsCapabilities }) {
            settingsCapabilities.addCapability({
              id: 'apme',
              label: 'APME Quality',
            });
          },
        });
      },
    });

    await startTestBackend({
      features: [
        catalogModuleAnsibleSettingsPermissions,
        fakeConsumer,
        mockServices.rootConfig.factory({ data: {} }),
        permissionsRegistryMock.factory,
      ],
    });

    expect(permissionsRegistryMock.addResourceType).toHaveBeenCalledTimes(1);
    const call = permissionsRegistryMock.addResourceType.mock.calls[0][0];
    expect(call.permissions).toContain(ansibleSettingsEditPermission);
    expect(call.permissions).toContain(ansibleSettingsViewPermission);
    expect(call.rules).toHaveLength(1);
    expect(call.rules[0].name).toBe('FOR_CAPABILITY');

    const resources = await call.getResources!(['apme', 'unknown']);
    expect(resources).toEqual([{ capability: 'apme' }, undefined]);
  });

  it('logs warning and skips registration when no capabilities are added', async () => {
    const permissionsRegistryMock = mockServices.permissionsRegistry.mock();

    await startTestBackend({
      features: [
        catalogModuleAnsibleSettingsPermissions,
        mockServices.rootConfig.factory({ data: {} }),
        permissionsRegistryMock.factory,
      ],
    });

    expect(permissionsRegistryMock.addResourceType).not.toHaveBeenCalled();
  });
});
