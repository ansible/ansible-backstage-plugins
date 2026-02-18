import type { LoggerService } from '@backstage/backend-plugin-api';
import {
  ScmClient,
  RepositoryInfo,
  DirectoryEntry,
} from '@ansible/backstage-rhaap-common';
import type {
  DiscoveredGalaxyFile,
  AnsibleGitContentsSourceConfig,
} from '../types';

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
  getRepositories(): Promise<RepositoryInfo[]>;
  getBranches(repo: RepositoryInfo): Promise<string[]>;
  getTags(repo: RepositoryInfo): Promise<string[]>;
  getContents(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): Promise<DirectoryEntry[]>;
  getFileContent(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): Promise<string>;
  buildSourceLocation(repo: RepositoryInfo, ref: string, path: string): string;
  discoverGalaxyFiles(
    options: DiscoveryOptions,
  ): Promise<DiscoveredGalaxyFile[]>;
  discoverGalaxyFilesInRepos(
    repos: RepositoryInfo[],
    options: DiscoveryOptions,
  ): Promise<DiscoveredGalaxyFile[]>;
}

export interface ScmCrawlerConfig {
  sourceConfig: AnsibleGitContentsSourceConfig;
  logger: LoggerService;
  scmClient: ScmClient;
}

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

  async getRepositories(): Promise<RepositoryInfo[]> {
    return this.client.getRepositories();
  }

  async getBranches(repo: RepositoryInfo): Promise<string[]> {
    return this.client.getBranches(repo);
  }

  async getTags(repo: RepositoryInfo): Promise<string[]> {
    return this.client.getTags(repo);
  }

  async getContents(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): Promise<DirectoryEntry[]> {
    return this.client.getContents(repo, ref, path);
  }

  async getFileContent(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): Promise<string> {
    return this.client.getFileContent(repo, ref, path);
  }

  buildSourceLocation(repo: RepositoryInfo, ref: string, path: string): string {
    return this.client.buildSourceLocation(repo, ref, path);
  }

  abstract discoverGalaxyFiles(
    options: DiscoveryOptions,
  ): Promise<DiscoveredGalaxyFile[]>;

  abstract discoverGalaxyFilesInRepos(
    repos: RepositoryInfo[],
    options: DiscoveryOptions,
  ): Promise<DiscoveredGalaxyFile[]>;

  protected isGalaxyFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return lowerName === 'galaxy.yml' || lowerName === 'galaxy.yaml';
  }

  protected matchesTagPattern(tag: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      const regexPattern = pattern
        .replaceAll(/[.+^${}()|[\]\\]/g, '\\$&')
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
