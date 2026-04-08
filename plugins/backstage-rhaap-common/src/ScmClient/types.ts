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
  token?: string;
  /** API base URL (e.g. GitHub: https://api.github.com, GHE: https://ghe.company.com/api/v3, GitLab: https://gitlab.example.com/api/v4). When set, used instead of host-derived URL. */
  apiBaseUrl?: string;
  /** When false, TLS certificate verification is disabled (e.g. self-signed or internal CA). Default true. */
  checkSSL?: boolean;
  /**
   * When true, GitLab API requests use `Authorization: Bearer` (OAuth access tokens from the scaffolder).
   * When false/undefined, uses `PRIVATE-TOKEN` (personal/project/group access tokens from integration config).
   */
  gitlabUseBearerAuth?: boolean;
}

export interface UrlBuildOptions {
  repo: RepositoryInfo;
  ref: string;
  path: string;
  type: 'file' | 'dir';
}
