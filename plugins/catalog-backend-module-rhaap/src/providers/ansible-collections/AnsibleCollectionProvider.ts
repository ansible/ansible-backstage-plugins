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
  AnsibleCollectionSourceConfig,
  DiscoveredGalaxyFile,
  SourceSyncStatus,
} from './types';
import { ScmCrawlerFactory } from './scm';
import type { ScmCrawler } from './scm';
import {
  parseCollectionToEntity,
  createCollectionKey,
  createCollectionIdentifier,
  generateSourceId,
} from './collectionParser';
import { readAnsibleCollectionConfigs } from './config';

const DEFAULT_CRAWL_DEPTH = 5;
const DEFAULT_BATCH_SIZE = 20;

export class AnsibleCollectionProvider implements EntityProvider {
  private readonly sourceConfig: AnsibleCollectionSourceConfig;
  private readonly logger: LoggerService;
  private readonly crawler: ScmCrawler;
  private readonly scheduleFn: () => Promise<void>;
  private readonly sourceId: string;
  private connection?: EntityProviderConnection;
  private lastSyncTime: string | null = null;
  private lastSyncCollections: number = 0;
  private lastSyncError?: string;
  static pluginLogName = 'plugin-catalog-rhaap-collections';

  static async fromConfig(
    config: Config,
    options: {
      logger: LoggerService;
      schedule?: SchedulerServiceTaskRunner;
      scheduler?: SchedulerService;
    },
  ): Promise<AnsibleCollectionProvider[]> {
    const { logger } = options;

    logger.info(
      `[${this.pluginLogName}]: Initializing Ansible Collection Provider...`,
    );

    const sourceConfigs = readAnsibleCollectionConfigs(config);

    logger.info(
      `[${this.pluginLogName}]: Found ${sourceConfigs.length} source(s) in configuration.`,
    );

    if (sourceConfigs.length === 0) {
      logger.info(
        `[${this.pluginLogName}]: No Ansible collection sources configured. ` +
          `Add sources under catalog.providers.rhaap.<env>.sync.ansibleCollections.sources`,
      );
      return [];
    }

    const crawlerFactory = new ScmCrawlerFactory({
      rootConfig: config,
      logger,
    });
    const providers: AnsibleCollectionProvider[] = [];

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
        const provider = new AnsibleCollectionProvider(
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
    sourceConfig: AnsibleCollectionSourceConfig,
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
        `[${AnsibleCollectionProvider.pluginLogName}]: Creating schedule for ${this.sourceId}`,
      );

      return taskRunner.run({
        id: taskId,
        fn: async () => {
          try {
            await this.run();
          } catch (error) {
            if (isError(error)) {
              this.logger.error(
                `[${AnsibleCollectionProvider.pluginLogName}]: Error syncing collections from ${this.sourceId}`,
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
    return `AnsibleCollectionProvider:${this.sourceId}`;
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
      `[${AnsibleCollectionProvider.pluginLogName}]: Starting collection discovery for ${this.sourceId}`,
    );

    const startTime = Date.now();
    let success = true;
    const allEntities: Entity[] = [];
    const seenCollectionKeys = new Set<string>();

    try {
      const repos = await this.crawler.getRepositories();
      this.logger.info(
        `[${AnsibleCollectionProvider.pluginLogName}]: Found ${repos.length} repositories in ${this.sourceId}`,
      );

      const batchSize = DEFAULT_BATCH_SIZE;
      const totalBatches = Math.ceil(repos.length / batchSize);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, repos.length);
        const batchRepos = repos.slice(batchStart, batchEnd);

        this.logger.info(
          `[${AnsibleCollectionProvider.pluginLogName}]: Processing batch ${batchIndex + 1}/${totalBatches} (repos ${batchStart + 1}-${batchEnd} of ${repos.length})`,
        );

        try {
          if (batchIndex === 0) {
            this.logger.info(
              `[${AnsibleCollectionProvider.pluginLogName}]: Discovery options: branches=${JSON.stringify(this.sourceConfig.branches)}, tags=${JSON.stringify(this.sourceConfig.tags)}, crawlDepth=${this.sourceConfig.crawlDepth || DEFAULT_CRAWL_DEPTH}`,
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

          if (uniqueInBatch.length > 0) {
            const batchEntities = this.convertToEntities(uniqueInBatch);
            allEntities.push(...batchEntities);

            this.logger.info(
              `[${AnsibleCollectionProvider.pluginLogName}]: Batch ${batchIndex + 1} found ${galaxyFiles.length} galaxy files, ${uniqueInBatch.length} unique collections`,
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
              `[${AnsibleCollectionProvider.pluginLogName}]: Added ${batchEntities.length} collections from batch ${batchIndex + 1}`,
            );
          } else {
            this.logger.info(
              `[${AnsibleCollectionProvider.pluginLogName}]: Batch ${batchIndex + 1} found no unique collections`,
            );
          }
        } catch (batchError) {
          const batchErrorMessage =
            batchError instanceof Error
              ? batchError.message
              : String(batchError);
          this.logger.warn(
            `[${AnsibleCollectionProvider.pluginLogName}]: Error processing batch ${batchIndex + 1}: ${batchErrorMessage}`,
          );
        }
      }

      this.logger.info(
        `[${AnsibleCollectionProvider.pluginLogName}]: Applying final reconciliation with ${allEntities.length} total collections`,
      );

      await this.connection.applyMutation({
        type: 'full',
        entities: allEntities.map(entity => ({
          entity,
          locationKey: this.getProviderName(),
        })),
      });

      this.lastSyncTime = new Date().toISOString();
      this.lastSyncCollections = allEntities.length;
      this.lastSyncError = undefined;

      const duration = Date.now() - startTime;
      this.logger.info(
        `[${AnsibleCollectionProvider.pluginLogName}]: Successfully synced ${allEntities.length} collections from ${this.sourceId} in ${duration}ms`,
      );
    } catch (e: unknown) {
      success = false;
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.lastSyncError = errorMessage;
      this.logger.error(
        `[${AnsibleCollectionProvider.pluginLogName}]: Error during collection discovery: ${errorMessage}`,
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
        `[${AnsibleCollectionProvider.pluginLogName}]: Skipped ${duplicates.length} duplicate collections:`,
      );
      for (const { key, location } of duplicates) {
        this.logger.info(
          `[${AnsibleCollectionProvider.pluginLogName}]:   - ${key} (found at ${location})`,
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

        const entity = parseCollectionToEntity({
          galaxyFile,
          sourceConfig: this.sourceConfig,
          sourceLocation,
        });

        entities.push(entity);
      } catch (e) {
        this.logger.warn(
          `[${AnsibleCollectionProvider.pluginLogName}]: Failed to convert collection ${galaxyFile.metadata.namespace}.${galaxyFile.metadata.name}: ${e}`,
        );
      }
    }

    return entities;
  }
}
