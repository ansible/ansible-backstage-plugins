/**
 * Canonical content type IDs used in `appliesToContentTypes`.
 *
 * Use these constants instead of raw strings so that a future rename is a
 * single-file change. The architecture document (§4.4) defines their meaning.
 */
export const CONTENT_TYPES = {
  /** Ansible collection (Galaxy v3, Pulp, or OCI artifact). */
  COLLECTION: 'collection',
  /**
   * An `execution-environment.yml` in source control — what was *requested*
   * to be built. Different from a built image.
   */
  EXECUTION_ENVIRONMENT_DEFINITION: 'execution-environment-definition',
  /**
   * A built OCI image with a digest, manifest, and trust evidence — what was
   * *actually* resolved by the build. Different from a definition file.
   */
  EXECUTION_ENVIRONMENT_IMAGE: 'execution-environment-image',
  /** A Git repository containing playbooks, roles, or collections. */
  PLAYBOOK_REPOSITORY: 'playbook-repository',
} as const;

export type ContentTypeId = (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES];

/**
 * Extension point IDs for each page surface in the self-service plugin.
 *
 * These IDs indicate *where* a contribution appears (which page, which panel).
 * They are used by `useExtensionTabs`, `useExtensionCards`, and
 * `useExtensionActions` to look up registered contributions.
 *
 * Native contributions declare supported attachments through Blueprints.
 * These IDs remain for legacy registry consumers.
 */
export const EXTENSION_POINTS = {
  // Git Repository detail page
  GIT_REPO_DETAIL_TABS: 'rhaap.git-repository.detail.tabs',
  GIT_REPO_DETAIL_CARDS: 'rhaap.git-repository.detail.cards',
  GIT_REPO_DETAIL_ACTIONS: 'rhaap.git-repository.detail.actions',
  GIT_REPO_LIST_TABS: 'rhaap.git-repository.list.tabs',
  GIT_REPO_LIST_ACTIONS: 'rhaap.git-repository.list.actions',

  // Execution Environments detail page
  EE_DETAIL_TABS: 'rhaap.execution-environment.detail.tabs',
  EE_DETAIL_CARDS: 'rhaap.execution-environment.detail.cards',
  EE_DETAIL_ACTIONS: 'rhaap.execution-environment.detail.actions',
  EE_LIST_TABS: 'rhaap.execution-environment.list.tabs',

  // Collections detail page
  COLLECTION_DETAIL_TABS: 'rhaap.collection.detail.tabs',
  COLLECTION_DETAIL_CARDS: 'rhaap.collection.detail.cards',
  COLLECTION_DETAIL_ACTIONS: 'rhaap.collection.detail.actions',

  // Templates detail page
  TEMPLATE_DETAIL_CARDS: 'rhaap.template.detail.cards',
} as const;

export type ExtensionPointId =
  (typeof EXTENSION_POINTS)[keyof typeof EXTENSION_POINTS];
