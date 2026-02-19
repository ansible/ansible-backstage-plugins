import { BaseScmClient, ScmClientOptions } from './ScmClient';
import type { RepositoryInfo, DirectoryEntry, UrlBuildOptions } from './types';

export class GitlabClient extends BaseScmClient {
  private readonly apiUrl: string;

  constructor(options: ScmClientOptions) {
    super(options);
    this.apiUrl = `https://${this.host}/api/v4`;
  }

  protected getDefaultHost(): string {
    return 'gitlab.com';
  }

  private async fetchRest<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      headers: {
        'PRIVATE-TOKEN': this.config.token,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitLab API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  private async fetchRawFile(endpoint: string): Promise<string> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      headers: {
        'PRIVATE-TOKEN': this.config.token,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch file: ${response.status} ${response.statusText}`,
      );
    }

    return response.text();
  }

  async getRepositories(): Promise<RepositoryInfo[]> {
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
      try {
        const endpoint = `/groups/${encodedGroup}/projects?include_subgroups=true&per_page=${perPage}&page=${page}`;
        const data = await this.fetchRest<ProjectResponse[]>(endpoint);

        for (const project of data) {
          // skip archived repos
          if (project.archived) {
            this.logger.debug(
              `[GitlabClient] Skipping archived project: ${project.path_with_namespace}`,
            );
            continue;
          }

          // skip empty repos
          if (project.empty_repo) {
            this.logger.debug(
              `[GitlabClient] Skipping empty project: ${project.path_with_namespace}`,
            );
            continue;
          }

          repos.push({
            name: project.name,
            fullPath: project.path_with_namespace,
            defaultBranch: project.default_branch || 'main',
            url: project.web_url,
            description: project.description || undefined,
          });
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

  async getBranches(repo: RepositoryInfo): Promise<string[]> {
    const branches: string[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    const encodedPath = encodeURIComponent(repo.fullPath);

    interface BranchResponse {
      name: string;
    }

    while (hasMore) {
      const data = await this.fetchRest<BranchResponse[]>(
        `/projects/${encodedPath}/repository/branches?per_page=${perPage}&page=${page}`,
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

  async getTags(repo: RepositoryInfo): Promise<string[]> {
    const tags: string[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    const encodedPath = encodeURIComponent(repo.fullPath);

    interface TagResponse {
      name: string;
    }

    while (hasMore) {
      const data = await this.fetchRest<TagResponse[]>(
        `/projects/${encodedPath}/repository/tags?per_page=${perPage}&page=${page}`,
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
        const endpoint = encodedFilePath
          ? `/projects/${encodedPath}/repository/tree?ref=${encodedRef}&path=${encodedFilePath}&per_page=${perPage}&page=${page}`
          : `/projects/${encodedPath}/repository/tree?ref=${encodedRef}&per_page=${perPage}&page=${page}`;

        const data = await this.fetchRest<TreeResponse[]>(endpoint);

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
          ...data.map(item => ({
            name: item.name,
            path: item.path,
            type: (item.type === 'tree' ? 'dir' : 'file') as 'dir' | 'file',
          })),
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
  ): Promise<string> {
    const encodedPath = encodeURIComponent(repo.fullPath);
    const encodedRef = encodeURIComponent(ref);
    const encodedFilePath = encodeURIComponent(path);

    return this.fetchRawFile(
      `/projects/${encodedPath}/repository/files/${encodedFilePath}/raw?ref=${encodedRef}`,
    );
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
