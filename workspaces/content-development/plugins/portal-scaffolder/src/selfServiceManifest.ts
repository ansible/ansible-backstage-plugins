import type { PluginManifest } from '@ansible/portal-extension-api';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';

/**
 * The host contract version self-service was built against.
 *
 * This must match the host's `HOST_API_VERSION` in `validateManifest.ts`.
 * Pre-1.0.0: both major and minor must match. Post-1.0.0: major only.
 */
export const SELF_SERVICE_API_VERSION = '0.1.0';

/** Stable SDK entry points for custom fields supplied by portal-scaffolder. */
const scaffolderFieldDefinitions = [
  ['AAPResourcePicker', 'aap-resource-picker', 'AAP resource picker'],
  ['BaseImagePicker', 'base-image-picker', 'Base image picker'],
  ['FileUploadPicker', 'file-upload-picker', 'File upload picker'],
  ['PackagesPicker', 'packages-picker', 'Packages picker'],
  ['MCPServersPicker', 'mcp-servers-picker', 'MCP servers picker'],
  [
    'AdditionalBuildStepsPicker',
    'additional-build-steps-picker',
    'Additional build steps picker',
  ],
  [
    'EEFileNamePicker',
    'ee-file-name-picker',
    'Execution environment file name picker',
  ],
  ['EETagsPicker', 'ee-tags-picker', 'Execution environment tags picker'],
] as const;

export const scaffolderFieldEntries = scaffolderFieldDefinitions.map(
  ([fieldName, id, label]) => ({
    fieldName,
    id: `portal-scaffolder.${id}`,
    label,
  }),
);

/**
 * Portal-scaffolder plugin manifest — declares every capability, entitlement,
 * and operation this plugin contributes to the portal.
 *
 * The host (`@ansible/portal-extension-host`) validates this manifest on
 * startup via `validateManifest()`. Invalid or incompatible capabilities are
 * skipped individually; the plugin does not fail to load.
 *
 * Phase 4 of ANSTRAT-2497: portal-scaffolder is wired as a first-party
 * contributor to prove the manifest pipeline before ANSTRAT-1758 and community
 * plugins depend on it.
 *
 * Content catalog pages and the related collection/SCM fields are owned by
 * automation-content and are declared in that plugin's manifest.
 */
export const selfServiceManifest: PluginManifest = {
  id: 'portal-scaffolder',
  version: '1.0.0',
  apiVersion: SELF_SERVICE_API_VERSION,

  capabilities: [
    // ── EE definition detail ──────────────────────────────────────────────
    {
      id: 'portal-scaffolder.ee-definition-detail',
      ownerPlugin: 'portal-scaffolder',
      displayName: 'Execution Environment Definition Detail',
      description:
        'Built-in EE definition detail view with README, about card, and resource cards.',
      appliesToContentTypes: [CONTENT_TYPES.EXECUTION_ENVIRONMENT_DEFINITION],
      entryPoints: [
        {
          id: 'portal-scaffolder.ee-definition-detail.overview-tab',
          kind: 'entity-tab',
          surface: 'entity-page',
          appliesToContentTypes: [
            CONTENT_TYPES.EXECUTION_ENVIRONMENT_DEFINITION,
          ],
          label: 'Overview',
          launches: { type: 'slot', targetSlot: 'ee-definition-detail-main' },
        },
      ],
      minimumHostApiVersion: '0.1.0',
    },

    // ── Native Scaffolder fields ───────────────────────────────────────────
    {
      id: 'portal-scaffolder.scaffolder-fields',
      ownerPlugin: 'portal-scaffolder',
      displayName: 'Scaffolder Fields',
      description: 'Custom form fields contributed for software templates.',
      appliesToContentTypes: '*',
      entryPoints: scaffolderFieldEntries.map(({ id, label }) => ({
        id,
        kind: 'scaffolder-field' as const,
        surface: 'experience-slot' as const,
        appliesToContentTypes: [
          CONTENT_TYPES.COLLECTION,
          CONTENT_TYPES.EXECUTION_ENVIRONMENT_DEFINITION,
          CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE,
          CONTENT_TYPES.PLAYBOOK_REPOSITORY,
        ],
        label,
        launches: { type: 'slot' as const, targetSlot: 'scaffolder.fields' },
      })),
      minimumHostApiVersion: '0.1.0',
    },
  ],

  // portal-scaffolder does not declare entitlements. Access is controlled via
  // the Backstage permissions registered in `backstage-rhaap-common/permissions.ts`.
  entitlements: [],
};
