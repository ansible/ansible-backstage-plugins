import {
  CONTENT_TYPES,
  type PluginManifest,
} from '@ansible/portal-extension-api';
import {
  collectionsViewPermission,
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
} from '@ansible/portal-extension-common';
import { eeMessages } from './strings/en';

export const eeCapabilityId = 'automation-content.ee-images';
export const eeVersionFieldEntryId =
  'automation-content.ee-images.version-picker';
export const eeDetailsEntryId = 'automation-content.ee-images.details';

export const collectionsCapabilityId = 'automation-content.collections';
export const collectionsListEntryId = 'automation-content.collections.list';
export const collectionsDetailEntryId = 'automation-content.collections.detail';

export const gitRepositoriesCapabilityId =
  'automation-content.git-repositories';
export const gitRepositoriesListEntryId =
  'automation-content.git-repositories.list';
export const gitRepositoriesDetailEntryId =
  'automation-content.git-repositories.detail';

export const movedFieldsCapabilityId = 'automation-content.scaffolder-fields';
export const collectionsPickerFieldEntryId =
  'automation-content.collections-picker';
export const scmSelectorFieldEntryId = 'automation-content.scm-selector';

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
      id: collectionsCapabilityId,
      ownerPlugin: 'automation-content',
      displayName: 'Collections catalog',
      description:
        'Collections catalog and detail experience for automation content.',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: [CONTENT_TYPES.COLLECTION],
      entryPoints: [
        {
          id: collectionsListEntryId,
          kind: 'page-tab',
          surface: 'experience-slot',
          label: 'Collections',
          appliesToContentTypes: [CONTENT_TYPES.COLLECTION],
          launches: { type: 'slot', targetSlot: 'collections-list' },
        },
        {
          id: collectionsDetailEntryId,
          kind: 'entity-tab',
          surface: 'entity-page',
          label: 'Overview',
          appliesToContentTypes: [CONTENT_TYPES.COLLECTION],
          requiredPermission: collectionsViewPermission,
          launches: { type: 'slot', targetSlot: 'collection-detail-main' },
        },
      ],
    },
    {
      id: gitRepositoriesCapabilityId,
      ownerPlugin: 'automation-content',
      displayName: 'Git repositories catalog',
      description:
        'Git repository catalog, CI activity, and detail experience.',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
      entryPoints: [
        {
          id: gitRepositoriesListEntryId,
          kind: 'page-tab',
          surface: 'experience-slot',
          label: 'Repositories',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          launches: { type: 'slot', targetSlot: 'repository-list-catalog' },
        },
        {
          id: gitRepositoriesDetailEntryId,
          kind: 'entity-tab',
          surface: 'entity-page',
          label: 'Overview',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          requiredPermission: gitRepositoriesViewPermission,
          launches: { type: 'slot', targetSlot: 'repository-detail-main' },
        },
      ],
    },
    {
      id: movedFieldsCapabilityId,
      ownerPlugin: 'automation-content',
      displayName: 'Collections and SCM fields',
      description:
        'Scaffolder fields for selecting collections and source control.',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: '*',
      entryPoints: [
        {
          id: collectionsPickerFieldEntryId,
          kind: 'scaffolder-field',
          surface: 'experience-slot',
          label: 'Collections picker',
          appliesToContentTypes: ['*'],
          launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
        },
        {
          id: scmSelectorFieldEntryId,
          kind: 'scaffolder-field',
          surface: 'experience-slot',
          label: 'Source control selector',
          appliesToContentTypes: ['*'],
          launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
        },
      ],
    },
  ],
};
