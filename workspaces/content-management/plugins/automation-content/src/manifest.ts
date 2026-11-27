import {
  CONTENT_TYPES,
  type PluginManifest,
} from '@ansible/portal-extension-api';
import { executionEnvironmentsViewPermission } from '@ansible/automation-content-common/permissions';
import { eeMessages } from './strings/en';

export const eeCapabilityId = 'automation-content.ee-images';
export const eeVersionFieldEntryId =
  'automation-content.ee-images.version-picker';
export const eeDetailsEntryId = 'automation-content.ee-images.details';
export const collectionsPickerEntryId = 'portal-scaffolder.collections-picker';
export const scmSelectorEntryId = 'portal-scaffolder.scm-selector';

export const automationContentManifest: PluginManifest = {
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
    {
      id: 'portal-scaffolder.collection-detail',
      ownerPlugin: 'automation-content',
      displayName: 'Collection Detail',
      description:
        'Built-in collection detail view providing a README, about card, and resource list.',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: [CONTENT_TYPES.COLLECTION],
      entryPoints: [
        {
          id: 'portal-scaffolder.collection-detail.overview-tab',
          kind: 'entity-tab',
          surface: 'entity-page',
          appliesToContentTypes: [CONTENT_TYPES.COLLECTION],
          label: 'Overview',
          launches: { type: 'slot', targetSlot: 'collection-detail-main' },
        },
      ],
    },
    {
      id: 'portal-scaffolder.repository-detail',
      ownerPlugin: 'automation-content',
      displayName: 'Repository Detail',
      description:
        'Built-in repository detail view with a README, about card, and CI activity tab.',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
      entryPoints: [
        {
          id: 'portal-scaffolder.repository-detail.overview-tab',
          kind: 'entity-tab',
          surface: 'entity-page',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          label: 'Overview',
          launches: { type: 'slot', targetSlot: 'repository-detail-main' },
        },
        {
          id: 'portal-scaffolder.repository-detail.ci-activity-tab',
          kind: 'entity-tab',
          surface: 'entity-page',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          label: 'CI Activity',
          launches: { type: 'slot', targetSlot: 'repository-detail-ci' },
        },
      ],
    },
    {
      id: 'portal-scaffolder.repository-list',
      ownerPlugin: 'automation-content',
      displayName: 'Repository List',
      description:
        'Built-in repository list with a catalog table view and CI activity view.',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
      entryPoints: [
        {
          id: 'portal-scaffolder.repository-list.catalog-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          label: 'Catalog',
          launches: { type: 'slot', targetSlot: 'repository-list-catalog' },
        },
        {
          id: 'portal-scaffolder.repository-list.ci-activity-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          label: 'CI Activity',
          launches: { type: 'slot', targetSlot: 'repository-list-ci' },
        },
      ],
    },
    {
      id: 'automation-content.scaffolder-fields',
      ownerPlugin: 'automation-content',
      displayName: 'Collection and Git Fields',
      description:
        'Scaffolder fields for selecting Ansible collections and source control repositories.',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: '*',
      entryPoints: [
        {
          id: collectionsPickerEntryId,
          kind: 'scaffolder-field',
          surface: 'experience-slot',
          appliesToContentTypes: [
            CONTENT_TYPES.COLLECTION,
            CONTENT_TYPES.PLAYBOOK_REPOSITORY,
          ],
          label: 'Collections picker',
          launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
        },
        {
          id: scmSelectorEntryId,
          kind: 'scaffolder-field',
          surface: 'experience-slot',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          label: 'Source control selector',
          launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
        },
      ],
    },
  ],
};
