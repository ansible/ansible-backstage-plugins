import { fetch as undiciFetch, Agent } from 'undici';
import { BaseScmClient, ScmClientOptions } from './ScmClient';
import type { RepositoryInfo, DirectoryEntry, UrlBuildOptions } from './types';

/**
 * Github client implementation using GraphQL and REST APIs
 *
 * Useing GraphQL for efficient batch operations &
 * REST API for specific operations when needed.
 */
export class GithubClient extends BaseScmClient {
  /** Retries after HTTP 5xx only: 1 initial request + this many retries (e.g. 2 → up to 3 attempts). */
  private static readonly MAX_RETRIES = 2;

  private readonly apiUrl: string;
  private readonly graphqlUrl: string;
  private readonly checkSSL: boolean;

  constructor(options: ScmClientOptions) {
    super(options);
    const base = options.config.apiBaseUrl?.replace(/\/$/, '');
    if (base) {
      this.apiUrl = base;
      this.graphqlUrl = `${base.replace(/\/v3\/?$/, '')}/graphql`;
    } else {
      this.apiUrl =
        this.host === 'github.com'
          ? 'https://api.github.com'
          : `https://${this.host}/api/v3`;
      this.graphqlUrl =
        this.host === 'github.com'
          ? 'https://api.github.com/graphql'
          : `https://${this.host}/api/graphql`;
    }
    this.checkSSL = options.config.checkSSL !== false;
  }

  protected getDefaultHost(): string {
    return 'github.com';
  }

  private getFetchOptions(init?: RequestInit): RequestInit & {
    dispatcher?: Agent;
  } {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers as Record<string, string>),
    };
    if (!this.checkSSL) {
      return {
        ...init,
        headers,
        dispatcher: new Agent({
          connect: { rejectUnauthorized: false },
        }),
      };
    }
    return { ...init, headers };
  }

  private async doFetch(url: string, init?: RequestInit): Promise<Response> {
    const opts = this.getFetchOptions(init);
    return this.checkSSL
      ? fetch(url, opts)
      : (undiciFetch(
          url,
          opts as Parameters<typeof undiciFetch>[1],
        ) as unknown as Promise<Response>);
  }

  private is5xxStatus(status: number): boolean {
    return status >= 500 && status < 600;
  }

  private sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(
          Object.assign(new Error('The operation was aborted'), {
            name: 'AbortError',
          }),
        );
        return;
      }
      const timeoutRef: { id?: ReturnType<typeof setTimeout> } = {};
      const onAbort = () => {
        if (timeoutRef.id !== undefined) clearTimeout(timeoutRef.id);
        signal?.removeEventListener('abort', onAbort);
        reject(
          Object.assign(new Error('The operation was aborted'), {
            name: 'AbortError',
          }),
        );
      };
      timeoutRef.id = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort);
    });
  }

  /**
   * On HTTP 5xx only, retry up to MAX_RETRIES times with short backoff.
   * Other statuses return immediately (caller handles errors).
   */
  private async fetchWithRetry(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const signal = init?.signal;
    const maxAttempts = 1 + GithubClient.MAX_RETRIES;
    let lastResponse!: Response;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
        });
      }

      lastResponse = await this.doFetch(url, init);

      if (lastResponse.ok || !this.is5xxStatus(lastResponse.status)) {
        return lastResponse;
      }

      if (attempt === maxAttempts - 1) {
        return lastResponse;
      }

      // Release the failed body before reusing the connection on the next attempt.
      try {
        await lastResponse.arrayBuffer().catch(() => undefined);
      } catch {
        // ignore (e.g. test doubles without arrayBuffer)
      }

      const delayMs = 1000 * (attempt + 1);
      this.logger.warn(
        `[GithubClient] HTTP ${lastResponse.status}, retry ${attempt + 1}/${GithubClient.MAX_RETRIES} after ${delayMs}ms`,
      );
      await this.sleepMs(delayMs, signal ?? undefined);
    }

    return lastResponse;
  }

  // fetch data from github REST API
  private async fetchRest<T>(
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.fetchWithRetry(`${this.apiUrl}${endpoint}`, {
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  private async fetchGraphQL<T>(
    query: string,
    variables: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.fetchWithRetry(this.graphqlUrl, {
      signal,
      method: 'POST',
      headers: {
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

    if (result.data === undefined) {
      throw new Error('GitHub GraphQL response missing data');
    }

    return result.data;
  }

  async getRepositories(signal?: AbortSignal): Promise<RepositoryInfo[]> {
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
      if (signal?.aborted) {
        throw new Error('SCM sync aborted, stopping repository pagination');
      }
      const data: QueryResult = await this.fetchGraphQL<QueryResult>(
        query,
        {
          org: this.config.organization,
          cursor,
        },
        signal,
      );

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

  async getBranches(
    repo: RepositoryInfo,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const branches: string[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    interface BranchResponse {
      name: string;
    }

    while (hasMore) {
      if (signal?.aborted) {
        throw new Error('SCM sync aborted, stopping branch fetch');
      }
      const data = await this.fetchRest<BranchResponse[]>(
        `/repos/${repo.fullPath}/branches?per_page=${perPage}&page=${page}`,
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

    interface TagResponse {
      name: string;
    }

    while (hasMore) {
      if (signal?.aborted) {
        throw new Error('SCM sync aborted, stopping tag fetch');
      }
      const data = await this.fetchRest<TagResponse[]>(
        `/repos/${repo.fullPath}/tags?per_page=${perPage}&page=${page}`,
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
    try {
      interface ContentResponse {
        name: string;
        path: string;
        type: string;
      }

      const encodedPath = path ? encodeURIComponent(path) : '';
      const endpoint = encodedPath
        ? `/repos/${
            repo.fullPath
          }/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
        : `/repos/${repo.fullPath}/contents?ref=${encodeURIComponent(ref)}`;

      const data = await this.fetchRest<ContentResponse[]>(endpoint, signal);

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
    signal?: AbortSignal,
  ): Promise<string> {
    const url = `${this.apiUrl}/repos/${repo.fullPath}/contents/${encodeURIComponent(
      path,
    )}?ref=${encodeURIComponent(ref)}`;
    const response = await this.fetchWithRetry(url, {
      signal,
      headers: {
        Accept: 'application/vnd.github.v3.raw',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch file content: ${response.status} ${response.statusText}`,
      );
    }

    return response.text();
  }

  async repositoryExists(
    owner: string,
    repo: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      const response = await this.doFetch(
        `${this.apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        { signal, method: 'HEAD' },
      );
      return response.ok;
    } catch (error) {
      this.logger.debug(
        `[GithubClient] Repository ${owner}/${repo} check failed: ${error}`,
      );
      return false;
    }
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

  /**
   * POST /repos/{owner}/{repo}/actions/workflows/{workflow_file}/dispatches
   *
   * With API version 2026-03-10 the endpoint returns 200 with
   * `workflow_run_id`, `run_url`, and `html_url` in the response body.
   */
  async dispatchActionsWorkflow(
    owner: string,
    repo: string,
    workflowFileName: string,
    ref: string,
    inputs: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    bodyText: string;
    workflowRunId?: number;
    workflowRunUrl?: string;
  }> {
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/actions/workflows/${encodeURIComponent(workflowFileName)}/dispatches`;
    const url = `${this.apiUrl}${path}`;
    const response = await this.doFetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      body: JSON.stringify({ ref, inputs }),
    });
    const bodyText = await response.text();

    let workflowRunId: number | undefined;
    let workflowRunUrl: string | undefined;
    if (response.ok && bodyText.trim()) {
      try {
        const data = JSON.parse(bodyText);
        workflowRunId = data.workflow_run_id ?? undefined;
        workflowRunUrl = data.html_url ?? undefined;
      } catch {
        /* non-JSON body (legacy 204) — ignore */
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      bodyText,
      workflowRunId,
      workflowRunUrl,
    };
  }
}
