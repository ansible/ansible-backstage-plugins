import { createExtensionPoint } from '@backstage/backend-plugin-api';

/** Registration payload for a settings capability (e.g. `{ id: 'apme' }`). */
export type AnsibleSettingsCapabilityRegistration = {
  id: string;
  label?: string;
};

/**
 * Extension point that capability owners register themselves with at backend
 * module-init time. A dedicated aggregator module collects the registrations
 * and dynamically builds the `FOR_CAPABILITY` rule + `addResourceType` call.
 */
export interface AnsibleSettingsCapabilitiesExtensionPoint {
  addCapability(registration: AnsibleSettingsCapabilityRegistration): void;
}

export const ansibleSettingsCapabilitiesExtensionPoint =
  createExtensionPoint<AnsibleSettingsCapabilitiesExtensionPoint>({
    id: 'ansible.settings.capabilities',
  });
