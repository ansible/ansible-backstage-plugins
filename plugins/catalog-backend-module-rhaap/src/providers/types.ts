import type { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';
import type {
  ScmProvider as CommonScmProvider,
  RepositoryInfo as CommonRepositoryInfo,
  DirectoryEntry as CommonDirectoryEntry,
} from '@ansible/backstage-rhaap-common';

export type PAHRepositoryConfig = {
  name: string;
  schedule: SchedulerServiceTaskScheduleDefinition | undefined;
};

export type AapConfig = {
  id: string;
  baseUrl: string;
  token: string;
  checkSSL: boolean;
  schedule?: SchedulerServiceTaskScheduleDefinition;
  organizations: string[];
  surveyEnabled?: boolean | undefined;
  jobTemplateLabels?: string[];
  jobTemplateExcludeLabels?: string[];
  /** When set, this config is for a PAH collection sync for the given repository name. */
  pahRepositories?: PAHRepositoryConfig[];
};

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
  /** When false, TLS verification is disabled for this host (e.g. self-signed or internal CA). Default true. */
  checkSSL?: boolean;
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
