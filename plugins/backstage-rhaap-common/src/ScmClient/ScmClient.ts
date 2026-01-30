import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  RepositoryInfo,
  DirectoryEntry,
  ScmClientConfig,
  UrlBuildOptions,
} from './types';

export interface ScmClient {
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
  buildUrl(options: UrlBuildOptions): string;
  buildSourceLocation(repo: RepositoryInfo, ref: string, path: string): string;
  getHost(): string;
  getOrganization(): string;
  getSourceId(): string;
}

export interface ScmClientOptions {
  config: ScmClientConfig;
  logger: LoggerService;
}

export abstract class BaseScmClient implements ScmClient {
  protected readonly config: ScmClientConfig;
  protected readonly logger: LoggerService;
  protected readonly host: string;

  constructor(options: ScmClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.host = this.config.host || this.getDefaultHost();
  }

  protected abstract getDefaultHost(): string;

  getHost(): string {
    return this.host;
  }
  getOrganization(): string {
    return this.config.organization;
  }
  getSourceId(): string {
    return `${this.config.scmProvider}-${this.host}-${this.config.organization}`
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/g, '-');
  }

  // abstract methods implemented by subclasses
  abstract getRepositories(): Promise<RepositoryInfo[]>;
  abstract getBranches(repo: RepositoryInfo): Promise<string[]>;
  abstract getTags(repo: RepositoryInfo): Promise<string[]>;
  abstract getContents(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): Promise<DirectoryEntry[]>;
  abstract getFileContent(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): Promise<string>;
  abstract buildUrl(options: UrlBuildOptions): string;
  abstract buildSourceLocation(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): string;
}
