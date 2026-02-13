import type { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';
import type {
  ScmProvider as CommonScmProvider,
  RepositoryInfo as CommonRepositoryInfo,
  DirectoryEntry as CommonDirectoryEntry,
} from '@ansible/backstage-rhaap-common';

export type ScmProvider = CommonScmProvider;
export type RepositoryInfo = CommonRepositoryInfo;
export type DirectoryEntry = CommonDirectoryEntry;

export interface OrgConfig {
  name: string;
  branches?: string[];
  tags?: string[];
  galaxyFilePaths?: string[];
  crawlDepth?: number;
  schedule: SchedulerServiceTaskScheduleDefinition;
}

export interface HostConfig {
  name: string;
  host?: string;
  orgs: OrgConfig[];
}

export interface AnsibleGitContentsProvidersConfig {
  enabled?: boolean;
  providers?: {
    github?: HostConfig[];
    gitlab?: HostConfig[];
  };
}

export interface AnsibleGitContentsSourceConfig {
  enabled: boolean;
  scmProvider: ScmProvider;
  hostName: string;
  host?: string;
  organization: string;
  branches?: string[];
  tags?: string[];
  galaxyFilePaths?: string[];
  crawlDepth?: number;
  schedule: SchedulerServiceTaskScheduleDefinition;
  env: string;
}

export interface AnsibleGitContentsConfig {
  sources: AnsibleGitContentsSourceConfig[];
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
  hostName: string;
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
  newCollections: number;
  repositoriesFound: number;
  lastError?: string;
}
