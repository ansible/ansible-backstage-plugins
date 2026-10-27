import type { PluginManifest } from '@ansible/portal-extension-api';
import { EXPERIENCE_IDS, CONTENT_TYPES } from '@ansible/portal-extension-api';

/**
 * The host contract version self-service was built against.
 *
 * This must match the host's `HOST_API_VERSION` in `validateManifest.ts`.
 * Pre-1.0.0: both major and minor must match. Post-1.0.0: major only.
 */
export const SELF_SERVICE_API_VERSION = '0.1.0';

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
 * Phase 6 note: When the content pages (CollectionsCatalog, GitRepositories)
 * move to the content workspace, they will be removed from this manifest and
 * replaced by separate manifests in their new packages.
 */
export const selfServiceManifest: PluginManifest = {
  id: 'portal-scaffolder',
  version: '1.0.0',
  apiVersion: SELF_SERVICE_API_VERSION,

  capabilities: [
    // ── Collection detail ─────────────────────────────────────────────────
    {
      id: 'portal-scaffolder.collection-detail',
      ownerPlugin: 'portal-scaffolder',
      experienceId: EXPERIENCE_IDS.CONTENT_AUTHORING,
      displayName: 'Collection Detail',
      description:
        'Built-in collection detail view providing a README, about card, and resource list.',
      appliesToContentTypes: [CONTENT_TYPES.COLLECTION],
      entryPoints: [
        {
          id: 'portal-scaffolder.collection-detail.overview-tab',
          kind: 'entity-tab',
          surface: 'entity-page',
          appliesToContentTypes: [CONTENT_TYPES.COLLECTION],
          label: 'Overview',
          // 'slot' launch: the host mounts CollectionDetailsPageInner into the
          // named slot. In Phase 4 this is still rendered directly by the page
          // component; full slot-based activation is a Phase 6+ refactor.
          launches: { type: 'slot', targetSlot: 'collection-detail-main' },
        },
      ],
      minimumHostApiVersion: '0.1.0',
    },

    // ── Repository detail ─────────────────────────────────────────────────
    {
      id: 'portal-scaffolder.repository-detail',
      ownerPlugin: 'portal-scaffolder',
      experienceId: EXPERIENCE_IDS.CONTENT_AUTHORING,
      displayName: 'Repository Detail',
      description:
        'Built-in repository detail view with a README, about card, and CI activity tab.',
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
      minimumHostApiVersion: '0.1.0',
    },

    // ── EE definition detail ──────────────────────────────────────────────
    {
      id: 'portal-scaffolder.ee-definition-detail',
      ownerPlugin: 'portal-scaffolder',
      experienceId: EXPERIENCE_IDS.CONTENT_AUTHORING,
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

    // ── Repository list ───────────────────────────────────────────────────
    {
      id: 'portal-scaffolder.repository-list',
      ownerPlugin: 'portal-scaffolder',
      experienceId: EXPERIENCE_IDS.CONTENT_AUTHORING,
      displayName: 'Repository List',
      description:
        'Built-in repository list with a catalog table view and CI activity view.',
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
      minimumHostApiVersion: '0.1.0',
    },
  ],

  // portal-scaffolder does not declare entitlements. Access is controlled via
  // the Backstage permissions registered in `backstage-rhaap-common/permissions.ts`.
  entitlements: [],
};
