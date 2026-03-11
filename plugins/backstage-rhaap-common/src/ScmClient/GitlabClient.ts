import { fetch as undiciFetch, Agent } from 'undici';
import { BaseScmClient, ScmClientOptions } from './ScmClient';
import type { RepositoryInfo, DirectoryEntry, UrlBuildOptions } from './types';

export class GitlabClient extends BaseScmClient {
  private readonly apiUrl: string;
  private readonly checkSSL: boolean;

  constructor(options: ScmClientOptions) {
    super(options);
    this.apiUrl =
      options.config.apiBaseUrl?.replace(/\/$/, '') ??
      `https://${this.host}/api/v4`;
    this.checkSSL = options.config.checkSSL !== false;
  }

  protected getDefaultHost(): string {
    return 'gitlab.com';
  }

  private getFetchOptions(accept = 'application/json'): RequestInit & {
    dispatcher?: Agent;
  } {
    const headers: Record<string, string> = {
      'PRIVATE-TOKEN': this.config.token,
      Accept: accept,
    };
    if (!this.checkSSL) {
      return {
        headers,
        dispatcher: new Agent({
          connect: { rejectUnauthorized: false },
        }),
      };
    }
    return { headers };
  }

  private async fetchRest<T>(
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    const opts = { ...this.getFetchOptions(), signal };
    const response = this.checkSSL
      ? await fetch(url, opts)
      : await undiciFetch(url, opts as Parameters<typeof undiciFetch>[1]);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitLab API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  private async fetchRawFile(
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const url = `${this.apiUrl}${endpoint}`;
    const opts = { ...this.getFetchOptions('*/*'), signal };
    const response = this.checkSSL
      ? await fetch(url, opts)
      : await undiciFetch(url, opts as Parameters<typeof undiciFetch>[1]);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch file: ${response.status} ${response.statusText}`,
      );
    }

    return response.text();
  }

  private projectToRepositoryInfo(project: {
    name: string;
    path_with_namespace: string;
    default_branch: string;
    web_url: string;
    description: string | null;
  }): RepositoryInfo {
    return {
      name: project.name,
      fullPath: project.path_with_namespace,
      defaultBranch: project.default_branch || 'main',
      url: project.web_url,
      description: project.description || undefined,
    };
  }

  private shouldIncludeProject(project: {
    archived: boolean;
    empty_repo: boolean;
    path_with_namespace: string;
  }): boolean {
    if (project.archived) {
      this.logger.debug(
        `[GitlabClient] Skipping archived project: ${project.path_with_namespace}`,
      );
      return false;
    }
    if (project.empty_repo) {
      this.logger.debug(
        `[GitlabClient] Skipping empty project: ${project.path_with_namespace}`,
      );
      return false;
    }
    return true;
  }

  async getRepositories(signal?: AbortSignal): Promise<RepositoryInfo[]> {
    const repos: RepositoryInfo[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    const encodedGroup = encodeURIComponent(this.config.organization);

    this.logger.info(
      `[GitlabClient] Starting to fetch projects from group: ${this.config.organization}`,
    );

    interface ProjectResponse {
      id: number;
      name: string;
      path_with_namespace: string;
      default_branch: string;
      web_url: string;
      description: string | null;
      archived: boolean;
      empty_repo: boolean;
    }

    while (hasMore) {
      if (signal?.aborted) {
        throw new Error('SCM sync aborted, stopping repository pagination');
      }
      try {
        const endpoint = `/groups/${encodedGroup}/projects?include_subgroups=true&per_page=${perPage}&page=${page}`;
        const data = await this.fetchRest<ProjectResponse[]>(endpoint, signal);

        for (const project of data) {
          if (!this.shouldIncludeProject(project)) continue;
          repos.push(this.projectToRepositoryInfo(project));
        }

        if (data.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (error) {
        this.logger.error(
          `[GitlabClient] Error fetching projects from group ${this.config.organization}: ${error}`,
        );
        throw error;
      }
    }

    this.logger.info(
      `[GitlabClient] Found ${repos.length} projects in group ${this.config.organization}`,
    );
    return repos;
  }

  async getBranches(
    repo: RepositoryInfo,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const branches: string[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    const encodedPath = encodeURIComponent(repo.fullPath);

    interface BranchResponse {
      name: string;
    }

    while (hasMore) {
      if (signal?.aborted) {
        throw new Error('SCM sync aborted, stopping branch fetch');
      }
      const data = await this.fetchRest<BranchResponse[]>(
        `/projects/${encodedPath}/repository/branches?per_page=${perPage}&page=${page}`,
        signal,
      );

      branches.push(...data.map(b => b.name));

      if (data.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return branches;
  }

  async getTags(repo: RepositoryInfo, signal?: AbortSignal): Promise<string[]> {
    const tags: string[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    const encodedPath = encodeURIComponent(repo.fullPath);

    interface TagResponse {
      name: string;
    }

    while (hasMore) {
      if (signal?.aborted) {
        throw new Error('SCM sync aborted, stopping tag fetch');
      }
      const data = await this.fetchRest<TagResponse[]>(
        `/projects/${encodedPath}/repository/tags?per_page=${perPage}&page=${page}`,
        signal,
      );

      tags.push(...data.map(t => t.name));

      if (data.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return tags;
  }

  async getContents(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<DirectoryEntry[]> {
    const allEntries: DirectoryEntry[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    try {
      const encodedPath = encodeURIComponent(repo.fullPath);
      const encodedRef = encodeURIComponent(ref);
      const encodedFilePath = path ? encodeURIComponent(path) : '';

      interface TreeResponse {
        name: string;
        path: string;
        type: string;
      }

      while (hasMore) {
        if (signal?.aborted) {
          throw new Error('SCM sync aborted, stopping contents fetch');
        }
        const endpoint = encodedFilePath
          ? `/projects/${encodedPath}/repository/tree?ref=${encodedRef}&path=${encodedFilePath}&per_page=${perPage}&page=${page}`
          : `/projects/${encodedPath}/repository/tree?ref=${encodedRef}&per_page=${perPage}&page=${page}`;

        const data = await this.fetchRest<TreeResponse[]>(endpoint, signal);

        const galaxyFiles = data.filter(
          item =>
            item.type === 'blob' &&
            (item.name === 'galaxy.yml' || item.name === 'galaxy.yaml'),
        );
        if (galaxyFiles.length > 0) {
          this.logger.info(
            `[GitlabClient] Found galaxy files in ${repo.fullPath}@${ref}`,
          );
        }

        allEntries.push(
          ...data.map(
            (item): DirectoryEntry => ({
              name: item.name,
              path: item.path,
              type: item.type === 'tree' ? 'dir' : 'file',
            }),
          ),
        );

        if (data.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      }

      return allEntries;
    } catch (error) {
      this.logger.warn(
        `[GitlabClient] Error getting contents for ${repo.fullPath}/${path}@${ref}: ${error}`,
      );
      return [];
    }
  }

  async getFileContent(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const encodedPath = encodeURIComponent(repo.fullPath);
    const encodedRef = encodeURIComponent(ref);
    const encodedFilePath = encodeURIComponent(path);

    return this.fetchRawFile(
      `/projects/${encodedPath}/repository/files/${encodedFilePath}/raw?ref=${encodedRef}`,
      signal,
    );
  }

  async repositoryExists(
    owner: string,
    repo: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const url = `${this.apiUrl}/projects/${projectPath}`;
    const opts = { ...this.getFetchOptions(), signal, method: 'HEAD' as const };

    try {
      const response = this.checkSSL
        ? await fetch(url, opts)
        : await undiciFetch(url, opts as Parameters<typeof undiciFetch>[1]);
      return response.ok;
    } catch (error) {
      this.logger.debug(
        `[GitlabClient] Repository ${owner}/${repo} check failed: ${error}`,
      );
      return false;
    }
  }

  buildUrl(options: UrlBuildOptions): string {
    const { repo, ref, path, type } = options;
    const urlType = type === 'file' ? 'blob' : 'tree';
    if (path) {
      return `https://${this.host}/${repo.fullPath}/-/${urlType}/${ref}/${path}`;
    }
    return `https://${this.host}/${repo.fullPath}/-/${urlType}/${ref}`;
  }

  buildSourceLocation(repo: RepositoryInfo, ref: string, path: string): string {
    const dirPath = path.includes('/')
      ? path.substring(0, path.lastIndexOf('/'))
      : '';
    const url = this.buildUrl({ repo, ref, path: dirPath, type: 'dir' });
    return `url:${url}`;
  }
}
