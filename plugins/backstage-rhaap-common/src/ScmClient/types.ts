export type ScmProvider = 'github' | 'gitlab';

export interface RepositoryInfo {
  name: string;
  fullPath: string;
  defaultBranch: string;
  url: string;
  description?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

export interface ScmClientConfig {
  scmProvider: ScmProvider;
  host?: string;
  organization: string;
  token: string;
}

export interface UrlBuildOptions {
  repo: RepositoryInfo;
  ref: string;
  path: string;
  type: 'file' | 'dir';
}
