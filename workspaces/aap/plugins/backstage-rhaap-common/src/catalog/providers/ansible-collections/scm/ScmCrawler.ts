import type { LoggerService } from '@backstage/backend-plugin-api';
import {
  ScmClient,
  RepositoryInfo,
  DirectoryEntry,
} from '@ansible/backstage-rhaap-common';
import type {
  DiscoveredGalaxyFile,
  AnsibleGitContentsSourceConfig,
} from '../../types';
import { validateGalaxyContent } from '../galaxySchema';
import yaml from 'yaml';

export type {
  RepositoryInfo,
  DirectoryEntry,
} from '@ansible/backstage-rhaap-common';

export interface DiscoveryOptions {
  branches?: string[];
  tags?: string[];
  galaxyFilePaths?: string[];
  crawlDepth: number;
}

export interface ScmCrawler {
  getRepositories(signal?: AbortSignal): Promise<RepositoryInfo[]>;
  getBranches(repo: RepositoryInfo, signal?: AbortSignal): Promise<string[]>;
  getTags(repo: RepositoryInfo, signal?: AbortSignal): Promise<string[]>;
  getContents(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<DirectoryEntry[]>;
  getFileContent(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<string>;
  buildSourceLocation(repo: RepositoryInfo, ref: string, path: string): string;
  discoverGalaxyFiles(
    options: DiscoveryOptions,
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]>;
  discoverGalaxyFilesInRepos(
    repos: RepositoryInfo[],
    options: DiscoveryOptions,
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]>;
}

export interface ScmCrawlerConfig {
  sourceConfig: AnsibleGitContentsSourceConfig;
  logger: LoggerService;
  scmClient: ScmClient;
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  '.gitlab',
  '__pycache__',
  '.tox',
  '.venv',
  'venv',
  '.cache',
  'dist',
  'build',
  'docs',
  'tests',
  'test',
]);

export abstract class BaseScmCrawler implements ScmCrawler {
  protected readonly config: AnsibleGitContentsSourceConfig;
  protected readonly logger: LoggerService;
  protected readonly client: ScmClient;

  constructor(crawlerConfig: ScmCrawlerConfig) {
    this.config = crawlerConfig.sourceConfig;
    this.logger = crawlerConfig.logger;
    this.client = crawlerConfig.scmClient;
  }

  protected getSourceId(): string {
    return this.client.getSourceId();
  }

  /** Display name for log messages (e.g. "GithubCrawler", "GitlabCrawler"). */
  protected abstract getCrawlerName(): string;

  /** Label for repos in log messages (e.g. "repositories", "projects"). */
  protected getRepoLabel(): string {
    return 'repositories';
  }

  async getRepositories(signal?: AbortSignal): Promise<RepositoryInfo[]> {
    return this.client.getRepositories(signal);
  }

  async getBranches(
    repo: RepositoryInfo,
    signal?: AbortSignal,
  ): Promise<string[]> {
    return this.client.getBranches(repo, signal);
  }

  async getTags(repo: RepositoryInfo, signal?: AbortSignal): Promise<string[]> {
    return this.client.getTags(repo, signal);
  }

  async getContents(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<DirectoryEntry[]> {
    return this.client.getContents(repo, ref, path, signal);
  }

  async getFileContent(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.client.getFileContent(repo, ref, path, signal);
  }

  buildSourceLocation(repo: RepositoryInfo, ref: string, path: string): string {
    return this.client.buildSourceLocation(repo, ref, path);
  }

  async discoverGalaxyFiles(
    options: DiscoveryOptions,
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]> {
    const repos = await this.getRepositories(signal);
    this.logger.info(
      `[${this.getCrawlerName()}] Starting galaxy.yml discovery in ${repos.length} ${this.getRepoLabel()}`,
    );
    return this.discoverGalaxyFilesInRepos(repos, options, signal);
  }

  async discoverGalaxyFilesInRepos(
    repos: RepositoryInfo[],
    options: DiscoveryOptions,
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]> {
    const discovered: DiscoveredGalaxyFile[] = [];
    const skippedRepos: Array<{ repo: string; reason: string }> = [];

    for (const repo of repos) {
      this.throwIfAborted(signal);
      await this.processRepository(
        repo,
        options,
        signal,
        discovered,
        skippedRepos,
      );
    }

    this.logSkippedRepos(skippedRepos);
    this.logger.info(
      `[${this.getCrawlerName()}] Discovered ${discovered.length} galaxy.yml files in ${repos.length} ${this.getRepoLabel()}`,
    );
    return discovered;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('SCM sync aborted, stopping galaxy file discovery');
    }
  }

  private async processRepository(
    repo: RepositoryInfo,
    options: DiscoveryOptions,
    signal: AbortSignal | undefined,
    discovered: DiscoveredGalaxyFile[],
    skippedRepos: Array<{ repo: string; reason: string }>,
  ): Promise<void> {
    try {
      const refsToSearch = await this.getRefsToSearch(repo, options, signal);
      const repoCollectionCount = await this.discoverInRefs(
        repo,
        refsToSearch,
        options,
        signal,
        discovered,
      );

      if (repoCollectionCount === 0) {
        skippedRepos.push({
          repo: repo.fullPath,
          reason: 'no valid galaxy.yml/yaml files found',
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      skippedRepos.push({
        repo: repo.fullPath,
        reason: `error: ${errorMsg}`,
      });
      this.logger.warn(
        `[${this.getCrawlerName()}] Error discovering collections in ${repo.fullPath}: ${error}`,
      );
    }
  }

  private async discoverInRefs(
    repo: RepositoryInfo,
    refsToSearch: Array<{ ref: string; refType: 'branch' | 'tag' }>,
    options: DiscoveryOptions,
    signal: AbortSignal | undefined,
    discovered: DiscoveredGalaxyFile[],
  ): Promise<number> {
    let repoCollectionCount = 0;

    for (const { ref, refType } of refsToSearch) {
      this.throwIfAborted(signal);
      const galaxyFiles = await this.findGalaxyFilesInRepo(
        repo,
        ref,
        refType,
        options,
        signal,
      );
      repoCollectionCount += galaxyFiles.length;
      discovered.push(...galaxyFiles);
    }

    return repoCollectionCount;
  }

  private logSkippedRepos(
    skippedRepos: Array<{ repo: string; reason: string }>,
  ): void {
    if (skippedRepos.length === 0) {
      return;
    }
    const crawlerName = this.getCrawlerName();
    this.logger.info(
      `[${crawlerName}] Skipped ${skippedRepos.length} ${this.getRepoLabel()} with no collections:`,
    );
    for (const { repo, reason } of skippedRepos) {
      this.logger.info(`[${crawlerName}]   - ${repo}: ${reason}`);
    }
  }

  protected async getRefsToSearch(
    repo: RepositoryInfo,
    options: DiscoveryOptions,
    signal?: AbortSignal,
  ): Promise<Array<{ ref: string; refType: 'branch' | 'tag' }>> {
    const refs: Array<{ ref: string; refType: 'branch' | 'tag' }> = [];
    const searchedBranches = new Set<string>();

    this.logger.debug(
      `[${repo.fullPath}] Default branch: ${repo.defaultBranch}`,
    );
    refs.push({ ref: repo.defaultBranch, refType: 'branch' as const });
    searchedBranches.add(repo.defaultBranch);

    if (options.branches && options.branches.length > 0) {
      const configuredBranches = options.branches;
      const allBranches = await this.getBranches(repo, signal);
      this.logger.debug(
        `[${repo.fullPath}] Available branches: ${allBranches.join(', ') || 'none'}`,
      );
      this.logger.debug(
        `[${repo.fullPath}] Configured additional branches: ${configuredBranches.join(', ')}`,
      );

      const additionalBranches = allBranches.filter(
        b => configuredBranches.includes(b) && !searchedBranches.has(b),
      );

      if (additionalBranches.length > 0) {
        this.logger.debug(
          `[${repo.fullPath}] Will also search branches: ${additionalBranches.join(', ')}`,
        );
        refs.push(
          ...additionalBranches.map(b => ({
            ref: b,
            refType: 'branch' as const,
          })),
        );
        additionalBranches.forEach(b => searchedBranches.add(b));
      }
    }

    this.logger.debug(
      `[${repo.fullPath}] Total branches to search: ${Array.from(searchedBranches).join(', ')}`,
    );

    if (options.tags && options.tags.length > 0) {
      const allTags = await this.getTags(repo, signal);
      const matchingTags = this.filterTags(allTags, options.tags);
      refs.push(
        ...matchingTags.map(t => ({ ref: t, refType: 'tag' as const })),
      );
    }

    return refs;
  }

  protected async findGalaxyFilesInRepo(
    repo: RepositoryInfo,
    ref: string,
    refType: 'branch' | 'tag',
    options: DiscoveryOptions,
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]> {
    this.logger.debug(
      `[${this.getCrawlerName()}] Searching ${repo.fullPath} on ${refType} '${ref}' (default branch: ${repo.defaultBranch})`,
    );

    const hasConfiguredPaths =
      options.galaxyFilePaths && options.galaxyFilePaths.length > 0;

    if (hasConfiguredPaths) {
      return this.discoverFromConfiguredPaths(
        repo,
        ref,
        refType,
        options.galaxyFilePaths!,
        options.crawlDepth,
        signal,
      );
    }

    return this.discoverFromRoot(
      repo,
      ref,
      refType,
      options.crawlDepth,
      signal,
    );
  }

  private async discoverFromConfiguredPaths(
    repo: RepositoryInfo,
    ref: string,
    refType: 'branch' | 'tag',
    galaxyFilePaths: string[],
    crawlDepth: number,
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]> {
    const discovered: DiscoveredGalaxyFile[] = [];

    for (const basePath of galaxyFilePaths) {
      this.throwIfAborted(signal);
      const files = await this.crawlDirectory(
        repo,
        ref,
        basePath,
        crawlDepth,
        signal,
      );
      const galaxyFiles = await this.processGalaxyFiles(
        repo,
        ref,
        refType,
        files,
        signal,
      );
      discovered.push(...galaxyFiles);
    }

    return discovered;
  }

  private async discoverFromRoot(
    repo: RepositoryInfo,
    ref: string,
    refType: 'branch' | 'tag',
    crawlDepth: number,
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]> {
    const files = await this.crawlDirectory(repo, ref, '', crawlDepth, signal);

    if (files.length === 0) {
      this.logger.debug(
        `[${this.getCrawlerName()}] No galaxy.yml files found in ${repo.fullPath}@${ref} after crawling`,
      );
    }

    return this.processGalaxyFiles(repo, ref, refType, files, signal);
  }

  private async processGalaxyFiles(
    repo: RepositoryInfo,
    ref: string,
    refType: 'branch' | 'tag',
    filePaths: string[],
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile[]> {
    const discovered: DiscoveredGalaxyFile[] = [];

    for (const filePath of filePaths) {
      this.throwIfAborted(signal);
      const galaxyFile = await this.processGalaxyFile(
        repo,
        ref,
        refType,
        filePath,
        signal,
      );
      if (galaxyFile) {
        discovered.push(galaxyFile);
      }
    }

    return discovered;
  }

  protected async crawlDirectory(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    depth: number,
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (depth <= 0) {
      return [];
    }

    try {
      const contents = await this.getContents(repo, ref, path, signal);
      this.logEmptyRootDirectory(path, contents, repo, ref);
      return this.processDirectoryContents(contents, repo, ref, depth, signal);
    } catch (error) {
      this.logCrawlError(error, repo, ref, path);
      return [];
    }
  }

  private logEmptyRootDirectory(
    path: string,
    contents: Array<{ type: string; name: string; path: string }>,
    repo: RepositoryInfo,
    ref: string,
  ): void {
    if (path === '' && contents.length === 0) {
      this.logger.warn(
        `[${this.getCrawlerName()}] Empty contents returned for ${repo.fullPath}@${ref} root directory`,
      );
    }
  }

  private async processDirectoryContents(
    contents: Array<{ type: string; name: string; path: string }>,
    repo: RepositoryInfo,
    ref: string,
    depth: number,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const galaxyFiles: string[] = [];

    for (const entry of contents) {
      this.throwIfAborted(signal);
      const files = await this.processDirectoryEntry(
        entry,
        repo,
        ref,
        depth,
        signal,
      );
      galaxyFiles.push(...files);
    }

    return galaxyFiles;
  }

  private async processDirectoryEntry(
    entry: { type: string; name: string; path: string },
    repo: RepositoryInfo,
    ref: string,
    depth: number,
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (entry.type === 'file' && this.isGalaxyFile(entry.name)) {
      this.logger.debug(
        `[${this.getCrawlerName()}] Found galaxy file: ${repo.fullPath}/${entry.path}@${ref}`,
      );
      return [entry.path];
    }

    if (entry.type === 'dir' && !this.shouldSkipDirectory(entry.name)) {
      return this.crawlDirectory(repo, ref, entry.path, depth - 1, signal);
    }

    return [];
  }

  private logCrawlError(
    error: unknown,
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const crawlerName = this.getCrawlerName();

    if (path === '') {
      this.logger.warn(
        `[${crawlerName}] Failed to fetch contents for ${repo.fullPath}@${ref}: ${errorMsg}`,
      );
    } else {
      this.logger.debug(
        `[${crawlerName}] Error crawling ${repo.fullPath}/${path}@${ref}: ${errorMsg}`,
      );
    }
  }

  protected shouldSkipDirectory(name: string): boolean {
    return SKIP_DIRS.has(name.toLowerCase());
  }

  protected async processGalaxyFile(
    repo: RepositoryInfo,
    ref: string,
    refType: 'branch' | 'tag',
    path: string,
    signal?: AbortSignal,
  ): Promise<DiscoveredGalaxyFile | null> {
    const crawlerName = this.getCrawlerName();
    try {
      const content = await this.getFileContent(repo, ref, path, signal);

      let parsed: unknown;
      try {
        parsed = yaml.parse(content);
      } catch (parseError) {
        this.logger.warn(
          `[${crawlerName}] Invalid YAML in ${repo.fullPath}/${path}@${ref}: ${parseError}`,
        );
        return null;
      }

      const validation = validateGalaxyContent(parsed);
      if (!validation.success) {
        this.logger.debug(
          `[${crawlerName}] Invalid galaxy.yml in ${repo.fullPath}/${path}@${ref}: ${validation.errors?.join(', ')}`,
        );
        return null;
      }

      return {
        repository: repo,
        ref,
        refType,
        path,
        content,
        metadata: validation.data,
      };
    } catch (error) {
      this.logger.warn(
        `[${crawlerName}] Error processing ${repo.fullPath}/${path}@${ref}: ${error}`,
      );
      return null;
    }
  }

  protected isGalaxyFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return lowerName === 'galaxy.yml' || lowerName === 'galaxy.yaml';
  }

  protected matchesTagPattern(tag: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      const regexPattern = pattern
        .replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
        .replaceAll('*', '.*')
        .replaceAll('?', '.');

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(tag);
    });
  }

  protected filterTags(allTags: string[], patterns?: string[]): string[] {
    if (!patterns || patterns.length === 0) {
      return [];
    }
    return allTags.filter(tag => this.matchesTagPattern(tag, patterns));
  }
}
