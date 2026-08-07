/*
 * Copyright Red Hat
 *
 * ADR-010: Remove manually registered repos from catalog + APME via guest plugin UI.
 */

import type { Entity } from '@backstage/catalog-model';
import type { CatalogApi } from '@backstage/catalog-client';
import {
  defaultBranchFromEntity,
  normalizeRepoUrlFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';
import type { ApmeApi } from '../api/ApmeApi';

/** True when the git-repository was registered via the manual Register repo flow. */
export function isManuallyRegisteredGitRepository(entity: Entity): boolean {
  if (
    (entity.spec as { type?: string } | undefined)?.type !== 'git-repository'
  ) {
    return false;
  }
  return (
    entity.metadata.annotations?.['ansible.io/registration-method'] ===
    'manual'
  );
}

/** Deletes APME project (if any) then removes the catalog entity by UID. */
export async function removeManualGitRepository(options: {
  entity: Entity;
  catalogApi: CatalogApi;
  apmeApi: ApmeApi;
  apmeEnabled: boolean;
}): Promise<void> {
  const { entity, catalogApi, apmeApi, apmeEnabled } = options;

  if (!isManuallyRegisteredGitRepository(entity)) {
    throw new Error(
      'Only manually registered repositories can be removed from the portal.',
    );
  }

  const uid = entity.metadata.uid;
  if (!uid) {
    throw new Error('Repository entity is missing metadata.uid');
  }

  if (apmeEnabled) {
    const repoUrl = normalizeRepoUrlFromEntity(entity);
    const branch = defaultBranchFromEntity(entity);
    if (repoUrl) {
      try {
        const project = await apmeApi.getProjectByRepoUrl(repoUrl, branch);
        if (project?.id) {
          await apmeApi.deleteProject(project.id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Not found is fine — entity may never have been scanned.
        if (
          !message.toLowerCase().includes('404') &&
          !message.toLowerCase().includes('not found')
        ) {
          throw err;
        }
      }
    }
  }

  await catalogApi.removeEntityByUid(uid);
}
