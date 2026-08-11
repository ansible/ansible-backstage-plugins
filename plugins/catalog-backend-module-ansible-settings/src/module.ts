import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  ansibleSettingsEditPermission,
  ansibleSettingsViewPermission,
} from '@ansible/backstage-rhaap-common/permissions';
import {
  ansibleSettingsResourceRef,
  createSettingsPermissionRules,
} from '@ansible/backstage-rhaap-common/permissions/rules';
import {
  ansibleSettingsCapabilitiesExtensionPoint,
  type AnsibleSettingsCapabilityRegistration,
} from '@ansible/backstage-rhaap-common/permissions/extensionPoint';

export const catalogModuleAnsibleSettingsPermissions = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'ansible-settings',
  register(reg) {
    const registrations: AnsibleSettingsCapabilityRegistration[] = [];

    reg.registerExtensionPoint(ansibleSettingsCapabilitiesExtensionPoint, {
      addCapability: (r: AnsibleSettingsCapabilityRegistration) => {
        registrations.push(r);
      },
    });

    reg.registerInit({
      deps: {
        permissionsRegistry: coreServices.permissionsRegistry,
        logger: coreServices.logger,
      },
      async init({ permissionsRegistry, logger }) {
        const ids = registrations.map(r => r.id);
        if (ids.length === 0) {
          logger.warn(
            'No ansible settings capabilities registered; skipping ansible.settings.edit/ansible.settings.view resource type registration',
          );
          return;
        }

        logger.info(
          `Registering ansible settings resource type with capabilities: ${ids.join(', ')}`,
        );

        permissionsRegistry.addResourceType({
          resourceRef: ansibleSettingsResourceRef,
          permissions: [
            ansibleSettingsEditPermission,
            ansibleSettingsViewPermission,
          ],
          rules: createSettingsPermissionRules(ids),
          getResources: async resourceRefs =>
            resourceRefs.map(ref =>
              ids.includes(ref) ? { capability: ref } : undefined,
            ),
        });
      },
    });
  },
});
