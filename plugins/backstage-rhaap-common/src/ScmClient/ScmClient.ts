import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  RepositoryInfo,
  DirectoryEntry,
  ScmClientConfig,
  UrlBuildOptions,
} from './types';

export interface ScmClient {
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
  repositoryExists(
    owner: string,
    repo: string,
    signal?: AbortSignal,
  ): Promise<boolean>;
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
  abstract getRepositories(signal?: AbortSignal): Promise<RepositoryInfo[]>;
  abstract getBranches(
    repo: RepositoryInfo,
    signal?: AbortSignal,
  ): Promise<string[]>;
  abstract getTags(
    repo: RepositoryInfo,
    signal?: AbortSignal,
  ): Promise<string[]>;
  abstract getContents(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<DirectoryEntry[]>;
  abstract getFileContent(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<string>;
  abstract repositoryExists(
    owner: string,
    repo: string,
    signal?: AbortSignal,
  ): Promise<boolean>;
  abstract buildUrl(options: UrlBuildOptions): string;
  abstract buildSourceLocation(
    repo: RepositoryInfo,
    ref: string,
    path: string,
  ): string;
}
