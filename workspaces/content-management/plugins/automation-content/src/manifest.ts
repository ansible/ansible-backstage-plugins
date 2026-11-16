import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type { EntityDetailTabDescriptor } from '@ansible/portal-extension-api/alpha';
import { executionEnvironmentsViewPermission } from '@ansible/automation-content-common/permissions';
import { eeMessages } from './strings/en';

export const eeCapabilityId = 'automation-content.ee-images';
export const eeVersionFieldEntryId =
  'automation-content.ee-images.version-picker';
export const eeDetailsEntryId = 'automation-content.ee-images.details';

export const automationContentManifest: EntityDetailTabDescriptor['manifest'] =
  {
    id: 'automation-content',
    version: '0.1.0',
    apiVersion: '0.1.0',
    entitlements: [],
    capabilities: [
      {
        id: eeCapabilityId,
        ownerPlugin: 'automation-content',
        displayName: eeMessages.detail.capability,
        description: eeMessages.detail.description,
        minimumHostApiVersion: '0.1.0',
        appliesToContentTypes: [CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE],
        entryPoints: [
          {
            id: eeVersionFieldEntryId,
            kind: 'scaffolder-field',
            surface: 'experience-slot',
            label: eeMessages.controllerVersion.label,
            appliesToContentTypes: [CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE],
            launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
          },
          {
            id: eeDetailsEntryId,
            kind: 'entity-tab',
            surface: 'entity-page',
            label: eeMessages.detail.tab,
            appliesToContentTypes: [CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE],
            requiredPermission: executionEnvironmentsViewPermission,
            launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
          },
        ],
      },
    ],
  };
