/** Catalog identity and HTTP contracts shared by discovery clients and producers. */
export const EE_REPOSITORY_ENTITY_TYPE = 'execution-environment-repository';
export const EE_REPOSITORY_ANNOTATIONS = {
  registry: 'ansible.com/registry',
  repository: 'ansible.com/repository',
  marker: 'ansible.com/ee-repository',
} as const;

export const EE_REPOSITORY_ENTITY_REF_PATTERN =
  /^component:default\/ee-repo-[0-9a-f]{48}$/;

export interface EERepositoryIdentity {
  registry: string;
  repository: string;
  entityRef: string;
}

export interface EERepositoryQuery {
  page?: number;
  pageSize?: 10 | 20 | 50;
  query?: string;
  registry?: string;
  tag?: string;
  descriptiveTag?: string;
  latestOnly?: boolean;
  owner?: string;
  sort?: 'repository' | 'registry' | 'lastSuccessfulReconcileAt';
  order?: 'asc' | 'desc';
  favoriteEntityRefs?: readonly string[];
}

export type EESigningState = 'signed' | 'not-signed' | 'undetermined';

export interface EERepositorySummary extends EERepositoryIdentity {
  representativeDigest: string;
  representativeRef: string;
  representativeTag?: string;
  tagCount: number;
  collectionCount?: number;
  signingState?: EESigningState;
  lastSuccessfulReconcileAt?: string;
}

export interface EERepositoryQueryResult {
  items: EERepositorySummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  /** Facets from the whole inventory before filtering or pagination. */
  facets?: {
    tags: string[];
    descriptiveTags?: string[];
    owners: string[];
    totalImages: number;
  };
}

export interface EERepositoryDigest {
  digest: string;
  artifactRef: string;
}

export interface EERepositoryTag extends EERepositoryDigest {
  tag: string;
  taggedPullReference: string;
  lastModified?: string;
}

export interface EERepositoryDetails extends EERepositoryIdentity {
  representativeRef: string;
  tags: EERepositoryTag[];
  digests: EERepositoryDigest[];
}

export interface EERepositorySyncResult {
  status: 'completed';
  registry: string;
  repository: string;
  addedTags: number;
  movedTags: number;
  removedTags: number;
  retainedPrevious: false;
  lastSuccessfulReconcileAt: string;
}

export interface InventorySyncResult {
  status: 'scheduled';
  taskId: string;
  triggeredAt: string;
}

export type { SigningObservation } from './oci/types';
