import type {
  LoggerService,
  SchedulerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import type { Config } from '@backstage/config';
import { isError, NotFoundError } from '@backstage/errors';
import { Entity } from '@backstage/catalog-model';

import type {
  AnsibleGitContentsSourceConfig,
  DiscoveredGalaxyFile,
  SourceSyncStatus,
} from './types';
import { ScmCrawlerFactory } from './scm';
import type { ScmCrawler } from './scm';
import {
  createCollectionKey,
  createCollectionIdentifier,
  createRepositoryKey,
  generateSourceId,
  generateCollectionEntityName,
} from './utils';
import { collectionParser, repositoryParser } from '../entityParser';
import { readAnsibleGitContentsConfigs } from './config';

const DEFAULT_CRAWL_DEPTH = 5;
const DEFAULT_BATCH_SIZE = 20;

export class AnsibleGitContentsProvider implements EntityProvider {
  private readonly sourceConfig: AnsibleGitContentsSourceConfig;
  private readonly logger: LoggerService;
  private readonly crawler: ScmCrawler;
  private readonly scheduleFn: () => Promise<void>;
  private readonly sourceId: string;
  private connection?: EntityProviderConnection;
  private lastSyncTime: string | null = null;
  private lastSyncCollections: number = 0;
  private lastSyncNewCollections: number = 0;
  private lastSyncRepositories: number = 0;
  private lastSyncError?: string;
  static pluginLogName = 'plugin-catalog-rhaap-git-contents';

  static async fromConfig(
    config: Config,
    options: {
      logger: LoggerService;
      schedule?: SchedulerServiceTaskRunner;
      scheduler?: SchedulerService;
    },
  ): Promise<AnsibleGitContentsProvider[]> {
    const { logger } = options;

    logger.info(
      `[${this.pluginLogName}]: Initializing Ansible Git Contents Provider...`,
    );

    const sourceConfigs = readAnsibleGitContentsConfigs(config);

    logger.info(
      `[${this.pluginLogName}]: Found ${sourceConfigs.length} source(s) in configuration.`,
    );

    if (sourceConfigs.length === 0) {
      logger.info(
        `[${this.pluginLogName}]: No Ansible Git Contents sources configured. ` +
          `Add providers under catalog.providers.rhaap.<env>.sync.ansibleGitContents.providers`,
      );
      return [];
    }

    const crawlerFactory = new ScmCrawlerFactory({
      rootConfig: config,
      logger,
    });
    const providers: AnsibleGitContentsProvider[] = [];

    for (const sourceConfig of sourceConfigs) {
      if (!sourceConfig.enabled) {
        logger.info(
          `[${this.pluginLogName}]: Source ${sourceConfig.scmProvider}/${sourceConfig.organization} is disabled, skipping.`,
        );
        continue;
      }

      try {
        let taskRunner: SchedulerServiceTaskRunner | undefined;

        if ('scheduler' in options && sourceConfig.schedule) {
          taskRunner = options.scheduler!.createScheduledTaskRunner(
            sourceConfig.schedule,
          );
        } else if ('schedule' in options) {
          taskRunner = options.schedule;
        }

        if (!taskRunner) {
          const sourceId = generateSourceId(sourceConfig);
          logger.warn(
            `[${this.pluginLogName}]: No schedule provided for source ${sourceId}, skipping.`,
          );
          continue;
        }

        const crawler = await crawlerFactory.createCrawler(sourceConfig);
        const provider = new AnsibleGitContentsProvider(
          sourceConfig,
          crawler,
          logger,
          taskRunner,
        );

        providers.push(provider);
        logger.info(
          `[${this.pluginLogName}]: Initialized provider for ${provider.getProviderName()}`,
        );
      } catch (error) {
        const sourceId = generateSourceId(sourceConfig);
        logger.error(
          `[${this.pluginLogName}]: Failed to initialize provider for ${sourceId}: ${error}`,
        );
      }
    }

    return providers;
  }

  private constructor(
    sourceConfig: AnsibleGitContentsSourceConfig,
    crawler: ScmCrawler,
    logger: LoggerService,
    taskRunner: SchedulerServiceTaskRunner,
  ) {
    this.sourceConfig = sourceConfig;
    this.crawler = crawler;
    this.sourceId = generateSourceId(sourceConfig);
    this.logger = logger.child({
      target: this.getProviderName(),
    });

    this.scheduleFn = this.createScheduleFn(taskRunner);
  }

  private createScheduleFn(
    taskRunner: SchedulerServiceTaskRunner,
  ): () => Promise<void> {
    return async () => {
      const taskId = `${this.getProviderName()}:run`;
      this.logger.info(
        `[${AnsibleGitContentsProvider.pluginLogName}]: Creating schedule for ${this.sourceId}`,
      );

      return taskRunner.run({
        id: taskId,
        fn: async () => {
          try {
            await this.run();
          } catch (error) {
            if (isError(error)) {
              this.logger.error(
                `[${AnsibleGitContentsProvider.pluginLogName}]: Error syncing collections from ${this.sourceId}`,
                {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                },
              );
              this.lastSyncError = error.message;
            }
          }
        },
      });
    };
  }

  getProviderName(): string {
    return `AnsibleGitContentsProvider:${this.sourceId}`;
  }

  getSourceId(): string {
    return this.sourceId;
  }

  getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  getSyncStatus(): SourceSyncStatus {
    return {
      sourceId: this.sourceId,
      enabled: this.sourceConfig.enabled,
      lastSync: this.lastSyncTime,
      collectionsFound: this.lastSyncCollections,
      newCollections: this.lastSyncNewCollections,
      repositoriesFound: this.lastSyncRepositories,
      lastError: this.lastSyncError,
    };
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
  }

  async run(): Promise<boolean> {
    if (!this.connection) {
      throw new NotFoundError('Provider not initialized - not connected');
    }

    this.logger.info(
      `[${AnsibleGitContentsProvider.pluginLogName}]: Starting collection discovery for ${this.sourceId}`,
    );

    const startTime = Date.now();
    let success = true;
    const allEntities: Entity[] = [];
    const seenCollectionKeys = new Set<string>();
    const repositoryData = new Map<
      string,
      {
        repo: DiscoveredGalaxyFile['repository'];
        count: number;
        collectionEntityNames: string[];
      }
    >();

    try {
      const repos = await this.crawler.getRepositories();
      this.logger.info(
        `[${AnsibleGitContentsProvider.pluginLogName}]: Found ${repos.length} repositories in ${this.sourceId}`,
      );

      const batchSize = DEFAULT_BATCH_SIZE;
      const totalBatches = Math.ceil(repos.length / batchSize);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, repos.length);
        const batchRepos = repos.slice(batchStart, batchEnd);

        this.logger.info(
          `[${AnsibleGitContentsProvider.pluginLogName}]: Processing batch ${batchIndex + 1}/${totalBatches} (repos ${batchStart + 1}-${batchEnd} of ${repos.length})`,
        );

        try {
          if (batchIndex === 0) {
            this.logger.info(
              `[${AnsibleGitContentsProvider.pluginLogName}]: Discovery options: branches=${JSON.stringify(this.sourceConfig.branches)}, tags=${JSON.stringify(this.sourceConfig.tags)}, crawlDepth=${this.sourceConfig.crawlDepth || DEFAULT_CRAWL_DEPTH}`,
            );
          }

          const galaxyFiles = await this.crawler.discoverGalaxyFilesInRepos(
            batchRepos,
            {
              branches: this.sourceConfig.branches,
              tags: this.sourceConfig.tags,
              galaxyFilePaths: this.sourceConfig.galaxyFilePaths,
              crawlDepth: this.sourceConfig.crawlDepth || DEFAULT_CRAWL_DEPTH,
            },
          );

          const uniqueInBatch = this.deduplicateCollectionsWithSet(
            galaxyFiles,
            seenCollectionKeys,
          );

          for (const file of uniqueInBatch) {
            const repoKey = createRepositoryKey(
              file.repository,
              this.sourceConfig,
            );
            const collectionEntityName = generateCollectionEntityName(
              file,
              this.sourceConfig,
            );
            const existing = repositoryData.get(repoKey);
            if (existing) {
              existing.count++;
              existing.collectionEntityNames.push(collectionEntityName);
            } else {
              repositoryData.set(repoKey, {
                repo: file.repository,
                count: 1,
                collectionEntityNames: [collectionEntityName],
              });
            }
          }

          if (uniqueInBatch.length > 0) {
            const batchEntities = this.convertToEntities(uniqueInBatch);
            allEntities.push(...batchEntities);

            this.logger.info(
              `[${AnsibleGitContentsProvider.pluginLogName}]: Batch ${batchIndex + 1} found ${galaxyFiles.length} galaxy files, ${uniqueInBatch.length} unique collections`,
            );

            await this.connection.applyMutation({
              type: 'delta',
              added: batchEntities.map(entity => ({
                entity,
                locationKey: this.getProviderName(),
              })),
              removed: [],
            });

            this.logger.info(
              `[${AnsibleGitContentsProvider.pluginLogName}]: Added ${batchEntities.length} collections from batch ${batchIndex + 1}`,
            );
          } else {
            this.logger.info(
              `[${AnsibleGitContentsProvider.pluginLogName}]: Batch ${batchIndex + 1} found no unique collections`,
            );
          }
        } catch (batchError) {
          const batchErrorMessage =
            batchError instanceof Error
              ? batchError.message
              : String(batchError);
          this.logger.warn(
            `[${AnsibleGitContentsProvider.pluginLogName}]: Error processing batch ${batchIndex + 1}: ${batchErrorMessage}`,
          );
        }
      }

      const repositoryEntities = this.createRepositoryEntities(repositoryData);
      allEntities.push(...repositoryEntities);

      this.logger.info(
        `[${AnsibleGitContentsProvider.pluginLogName}]: Created ${repositoryEntities.length} repository entities`,
      );

      this.logger.info(
        `[${AnsibleGitContentsProvider.pluginLogName}]: Applying final reconciliation with ${allEntities.length} total entities (${allEntities.length - repositoryEntities.length} collections + ${repositoryEntities.length} repositories)`,
      );

      await this.connection.applyMutation({
        type: 'full',
        entities: allEntities.map(entity => ({
          entity,
          locationKey: this.getProviderName(),
        })),
      });

      const currentCollectionCount =
        allEntities.length - repositoryEntities.length;
      const previousCollectionCount = this.lastSyncCollections;

      this.lastSyncNewCollections =
        previousCollectionCount === 0
          ? currentCollectionCount
          : currentCollectionCount - previousCollectionCount;

      this.lastSyncTime = new Date().toISOString();
      this.lastSyncCollections = currentCollectionCount;
      this.lastSyncRepositories = repositoryEntities.length;
      this.lastSyncError = undefined;

      const duration = Date.now() - startTime;
      const deltaStr =
        this.lastSyncNewCollections >= 0
          ? `+${this.lastSyncNewCollections}`
          : `${this.lastSyncNewCollections}`;
      this.logger.info(
        `[${AnsibleGitContentsProvider.pluginLogName}]: Successfully synced ${this.lastSyncCollections} collections (${deltaStr} new) and ${repositoryEntities.length} repositories from ${this.sourceId} in ${duration}ms`,
      );
    } catch (e: unknown) {
      success = false;
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.lastSyncError = errorMessage;
      this.logger.error(
        `[${AnsibleGitContentsProvider.pluginLogName}]: Error during collection discovery: ${errorMessage}`,
      );
    }

    return success;
  }

  private deduplicateCollectionsWithSet(
    galaxyFiles: DiscoveredGalaxyFile[],
    seenKeys: Set<string>,
  ): DiscoveredGalaxyFile[] {
    const unique: DiscoveredGalaxyFile[] = [];
    const duplicates: Array<{ key: string; location: string }> = [];

    for (const file of galaxyFiles) {
      const identifier = createCollectionIdentifier(file, this.sourceConfig);
      const key = createCollectionKey(identifier);

      if (seenKeys.has(key)) {
        duplicates.push({
          key,
          location: `${file.repository.fullPath}/${file.path}@${file.ref}`,
        });
      } else {
        seenKeys.add(key);
        unique.push(file);
      }
    }

    if (duplicates.length > 0) {
      this.logger.info(
        `[${AnsibleGitContentsProvider.pluginLogName}]: Skipped ${duplicates.length} duplicate collections:`,
      );
      for (const { key, location } of duplicates) {
        this.logger.info(
          `[${AnsibleGitContentsProvider.pluginLogName}]:   - ${key} (found at ${location})`,
        );
      }
    }

    return unique;
  }

  private convertToEntities(galaxyFiles: DiscoveredGalaxyFile[]): Entity[] {
    const entities: Entity[] = [];

    for (const galaxyFile of galaxyFiles) {
      try {
        const sourceLocation = this.crawler.buildSourceLocation(
          galaxyFile.repository,
          galaxyFile.ref,
          galaxyFile.path,
        );

        const entity = collectionParser({
          galaxyFile,
          sourceConfig: this.sourceConfig,
          sourceLocation,
        });

        entities.push(entity);
      } catch (e) {
        this.logger.warn(
          `[${AnsibleGitContentsProvider.pluginLogName}]: Failed to convert collection ${galaxyFile.metadata.namespace}.${galaxyFile.metadata.name}: ${e}`,
        );
      }
    }

    return entities;
  }

  private createRepositoryEntities(
    repositoryData: Map<
      string,
      {
        repo: DiscoveredGalaxyFile['repository'];
        count: number;
        collectionEntityNames: string[];
      }
    >,
  ): Entity[] {
    const entities: Entity[] = [];

    for (const [, { repo, count, collectionEntityNames }] of repositoryData) {
      try {
        const entity = repositoryParser({
          repository: repo,
          sourceConfig: this.sourceConfig,
          collectionCount: count,
          collectionEntityNames,
        });
        entities.push(entity);
      } catch (e) {
        this.logger.warn(
          `[${AnsibleGitContentsProvider.pluginLogName}]: Failed to create repository entity for ${repo.fullPath}: ${e}`,
        );
      }
    }

    return entities;
  }
}
