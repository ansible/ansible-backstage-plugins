import { BaseScmClient, ScmClientOptions } from './ScmClient';
import type { RepositoryInfo, DirectoryEntry, UrlBuildOptions } from './types';

/**
 * Github client implementation using GraphQL and REST APIs
 *
 * Useing GraphQL for efficient batch operations &
 * REST API for specific operations when needed.
 */
export class GithubClient extends BaseScmClient {
  private readonly apiUrl: string;
  private readonly graphqlUrl: string;

  constructor(options: ScmClientOptions) {
    super(options);
    this.apiUrl =
      this.host === 'github.com'
        ? 'https://api.github.com'
        : `https://${this.host}/api/v3`;
    this.graphqlUrl =
      this.host === 'github.com'
        ? 'https://api.github.com/graphql'
        : `https://${this.host}/api/graphql`;
  }

  protected getDefaultHost(): string {
    return 'github.com';
  }

  // fetch data from github REST API
  private async fetchRest<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // fetc data from github GraphQL API
  private async fetchGraphQL<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.graphqlUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub GraphQL error (${response.status}): ${error}`);
    }

    const result = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `GitHub GraphQL errors: ${JSON.stringify(result.errors)}`,
      );
    }

    return result.data as T;
  }

  async getRepositories(): Promise<RepositoryInfo[]> {
    const repos: RepositoryInfo[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    const query = `
      query($org: String!, $cursor: String) {
        organization(login: $org) {
          repositories(first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              name
              nameWithOwner
              defaultBranchRef {
                name
              }
              url
              description
              isArchived
              isEmpty
            }
          }
        }
      }
    `;

    interface RepoNode {
      name: string;
      nameWithOwner: string;
      defaultBranchRef: { name: string } | null;
      url: string;
      description: string | null;
      isArchived: boolean;
      isEmpty: boolean;
    }

    interface QueryResult {
      organization: {
        repositories: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: RepoNode[];
        };
      };
    }

    while (hasNextPage) {
      const data: QueryResult = await this.fetchGraphQL<QueryResult>(query, {
        org: this.config.organization,
        cursor,
      });

      const repoData = data.organization.repositories;

      for (const repo of repoData.nodes) {
        // skip archived and empty repos
        if (repo.isArchived || repo.isEmpty) {
          continue;
        }

        repos.push({
          name: repo.name,
          fullPath: repo.nameWithOwner,
          defaultBranch: repo.defaultBranchRef?.name || 'main',
          url: repo.url,
          description: repo.description || undefined,
        });
      }

      hasNextPage = repoData.pageInfo.hasNextPage;
      cursor = repoData.pageInfo.endCursor;
    }

    this.logger.info(
      `[GithubClient] Found ${repos.length} repositories in organization ${this.config.organization}`,
    );
    return repos;
  }

  async getBranches(repo: RepositoryInfo): Promise<string[]> {
    const branches: string[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    interface BranchResponse {
      name: string;
    }

    while (hasMore) {
      const data = await this.fetchRest<BranchResponse[]>(
        `/repos/${repo.fullPath}/branches?per_page=${perPage}&page=${page}`,
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

    interface TagResponse {
      name: string;
    }

    while (hasMore) {
      const data = await this.fetchRest<TagResponse[]>(
        `/repos/${repo.fullPath}/tags?per_page=${perPage}&page=${page}`,
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
    try {
      interface ContentResponse {
        name: string;
        path: string;
        type: string;
      }

      const encodedPath = path ? encodeURIComponent(path) : '';
      const endpoint = encodedPath
        ? `/repos/${repo.fullPath}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
        : `/repos/${repo.fullPath}/contents?ref=${encodeURIComponent(ref)}`;

      const data = await this.fetchRest<ContentResponse[]>(endpoint);

      return data.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'dir' : 'file',
      }));
    } catch (error) {
      this.logger.debug(
        `[GithubClient] Could not get contents for ${repo.fullPath}/${path}@${ref}: ${error}`,
      );
      return [];
    }
  }

  async getFileContent(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): Promise<string> {
    const response = await fetch(
      `${this.apiUrl}/repos/${repo.fullPath}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3.raw',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch file content: ${response.status} ${response.statusText}`,
      );
    }

    return response.text();
  }

  buildUrl(options: UrlBuildOptions): string {
    const { repo, ref, path, type } = options;
    const urlType = type === 'file' ? 'blob' : 'tree';
    if (path) {
      return `https://${this.host}/${repo.fullPath}/${urlType}/${ref}/${path}`;
    }
    return `https://${this.host}/${repo.fullPath}/${urlType}/${ref}`;
  }

  buildSourceLocation(repo: RepositoryInfo, ref: string, path: string): string {
    const dirPath = path.includes('/')
      ? path.substring(0, path.lastIndexOf('/'))
      : '';
    const url = this.buildUrl({ repo, ref, path: dirPath, type: 'dir' });
    return `url:${url}`;
  }
}
