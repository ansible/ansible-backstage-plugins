export const REPO_TOOLTIP =
  'Git repositories discovered from your configured Ansible content sources. Shows the collections available in the repository.';

export const REPO_DESCRIPTION =
  'Browse Git repositories from your connected Ansible content sources. Sync to discover repositories that contain Ansible collections.';

export const CONTENT_QUALITY_TOOLTIP =
  'Estate-wide content quality violations detected by APME scanning across your synced Git repositories. Shows rule violations grouped by severity, category, and affected repositories.';

export const CONTENT_QUALITY_DESCRIPTION =
  'Monitor content quality violations and rule compliance across your Ansible Git repositories. Review severity, affected repos, and remediation guidance.';

export const COLUMN_SOURCE_TOOLTIP =
  'The SCM provider and link to the repository (e.g. GitHub, GitLab).';

export const COLUMN_LAST_ACTIVITY_TOOLTIP =
  'The last CI or pipeline run on this repository (when available).';

export const COLUMN_CONTAINS_TOOLTIP =
  'What this repository contains: Ansible collections discovered from this source.';

export const COLUMN_LAST_SYNC_TOOLTIP =
  "When this repository's content source was last synced.";

export const PAGE_SIZE = 10;

export const CI_BATCH_CHUNK_SIZE = 100;
export const CI_PARALLEL_LIMIT = 5;
