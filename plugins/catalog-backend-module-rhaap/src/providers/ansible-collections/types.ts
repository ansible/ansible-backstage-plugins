import type { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';
import type {
  ScmProvider as CommonScmProvider,
  RepositoryInfo as CommonRepositoryInfo,
  DirectoryEntry as CommonDirectoryEntry,
} from '@ansible/backstage-rhaap-common';

export type ScmProvider = CommonScmProvider;
export type RepositoryInfo = CommonRepositoryInfo;
export type DirectoryEntry = CommonDirectoryEntry;

export interface AnsibleCollectionSourceConfig {
  enabled: boolean;
  scmProvider: ScmProvider;
  host?: string;
  organization: string;
  branches?: string[];
  tags?: string[];
  galaxyFilePaths?: string[];
  crawlDepth?: number;
  schedule: SchedulerServiceTaskScheduleDefinition;
}

export interface AnsibleCollectionsConfig {
  sources: AnsibleCollectionSourceConfig[];
}

export interface GalaxyMetadata {
  namespace: string;
  name: string;
  version: string;
  readme?: string;
  authors?: string[];
  description?: string;
  license?: string | string[];
  license_file?: string;
  tags?: string[];
  dependencies?: Record<string, string>;
  repository?: string;
  documentation?: string;
  homepage?: string;
  issues?: string;
  build_ignore?: string[];
}

export interface DiscoveredGalaxyFile {
  repository: RepositoryInfo;
  ref: string;
  refType: 'branch' | 'tag';
  path: string;
  content: string;
  metadata: GalaxyMetadata;
}

export interface CollectionIdentifier {
  scmProvider: ScmProvider;
  host: string;
  organization: string;
  namespace: string;
  name: string;
  version: string;
}

export interface SourceSyncStatus {
  sourceId: string;
  enabled: boolean;
  lastSync: string | null;
  collectionsFound: number;
  lastError?: string;
}
