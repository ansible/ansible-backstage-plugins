import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import {
  getGitHubOwnerRepo,
  getGitLabProjectPath,
  getRepoHost,
} from './scmUtils';

export interface BatchItem {
  key: string;
  provider: string;
  owner?: string;
  repo?: string;
  host?: string;
  projectPath?: string;
  per_page?: number;
}

export function buildBatchItems(
  entities: Entity[],
  perPage?: number,
): {
  items: BatchItem[];
  entityMap: Map<string, { entity: Entity; provider: string }>;
} {
  const items: BatchItem[] = [];
  const entityMap = new Map<string, { entity: Entity; provider: string }>();

  for (const entity of entities) {
    const ref = stringifyEntityRef(entity);
    const gh = getGitHubOwnerRepo(entity);
    const gl = getGitLabProjectPath(entity);

    if (gh) {
      items.push({
        key: ref,
        provider: 'github',
        owner: gh.owner,
        repo: gh.repo,
        host: getRepoHost(entity) || 'github.com',
        per_page: perPage,
      });
      entityMap.set(ref, { entity, provider: 'github' });
    } else if (gl) {
      items.push({
        key: ref,
        provider: 'gitlab',
        projectPath: gl,
        host: getRepoHost(entity) || 'gitlab.com',
        per_page: perPage,
      });
      entityMap.set(ref, { entity, provider: 'gitlab' });
    }
  }

  return { items, entityMap };
}
