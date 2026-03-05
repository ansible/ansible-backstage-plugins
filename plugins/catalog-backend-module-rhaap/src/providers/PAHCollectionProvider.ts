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

import { readAapApiEntityConfigs } from './config';
import { InputError, isError } from '@backstage/errors';
import { AapConfig, type PAHRepositoryConfig } from './types';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import { pahCollectionParser } from './entityParser';
import { Entity } from '@backstage/catalog-model';

export class PAHCollectionProvider implements EntityProvider {
  private readonly env: string;
  private readonly baseUrl: string;
  private readonly pahRepositoryName: string;
  private readonly logger: LoggerService;
  private readonly ansibleServiceRef: IAAPService;
  private readonly scheduleFn: () => Promise<void>;
  private connection?: EntityProviderConnection;
  private lastSyncTime: string | null = null;
  private lastFailedSyncTime: string | null = null;
  private lastSyncStatus: 'success' | 'failure' | null = null;
  private currentCollectionsCount: number = 0;
  private previousCollectionsCount: number = 0;
  private isSyncing: boolean = false;
  private readonly enabled: boolean = true;

  static readonly pluginLogName = 'plugin-catalog-rh-aap';
  static readonly syncEntity = 'pahCollections';

  static fromConfig(
    config: Config,
    ansibleServiceRef: IAAPService,
    options: {
      logger: LoggerService;
      schedule?: SchedulerServiceTaskRunner;
      scheduler?: SchedulerService;
    },
  ): PAHCollectionProvider[] {
    const { logger } = options;
    const providerConfigs = readAapApiEntityConfigs(config, this.syncEntity);

    // Only use the first providerConfig (with unique authEnv/configId)
    // PAH collections are shared across environments, so we only need one provider per repository
    const providerConfig = providerConfigs[0];
    if (!providerConfig) {
      logger.info(
        `[${PAHCollectionProvider.pluginLogName}]: No PAH Collection provider configs found.`,
      );
      return [];
    }

    logger.info(
      `[${PAHCollectionProvider.pluginLogName}]: Init PAH Collection providers from config with configId: ${providerConfig.id}`,
    );
    const pahRepositories = providerConfig.pahRepositories ?? [];
    return pahRepositories.map(pahRepository => {
      let taskRunner;
      if ('scheduler' in options && pahRepository.schedule) {
        taskRunner = options.scheduler!.createScheduledTaskRunner(
          pahRepository.schedule,
        );
      } else if ('schedule' in options) {
        taskRunner = options.schedule;
      } else {
        logger.info(
          `[${PAHCollectionProvider.pluginLogName}]: No schedule provided via config for PAH Collection Provider: ${pahRepository.name}.`,
        );
        throw new InputError(
          `No schedule provided via config for PAH Collection Provider: ${pahRepository.name}.`,
        );
      }
      if (!taskRunner) {
        logger.info(
          `[${PAHCollectionProvider.pluginLogName}]: No schedule provided via config for PAH Collection Provider: ${pahRepository.name}.`,
        );
        throw new InputError(
          `No schedule provided via config for PAH Collection Provider: ${pahRepository.name}.`,
        );
      }
      return new PAHCollectionProvider(
        providerConfig,
        pahRepository,
        logger,
        taskRunner,
        ansibleServiceRef,
      );
    });
  }

  private constructor(
    config: AapConfig,
    pahRepository: PAHRepositoryConfig,
    logger: LoggerService,
    taskRunner: SchedulerServiceTaskRunner,
    ansibleServiceRef: IAAPService,
  ) {
    this.env = config.id;
    this.baseUrl = config.baseUrl;
    this.pahRepositoryName = pahRepository.name;
    this.logger = logger.child({
      target: this.getProviderName(),
    });
    this.ansibleServiceRef = ansibleServiceRef;
    this.scheduleFn = this.createScheduleFn(taskRunner);
    this.logger.info(
      `[${PAHCollectionProvider.pluginLogName}]: Provider created for PAH Repository: ${this.pahRepositoryName} with configId: ${this.env}`,
    );
  }

  getProviderName(): string {
    return `PAHCollectionProvider:${this.env}:${this.pahRepositoryName}`;
  }

  getPahRepositoryName(): string {
    return this.pahRepositoryName;
  }

  getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  getLastFailedSyncTime(): string | null {
    return this.lastFailedSyncTime;
  }

  getLastSyncStatus(): 'success' | 'failure' | null {
    return this.lastSyncStatus;
  }

  getCurrentCollectionsCount(): number {
    return this.currentCollectionsCount;
  }

  getCollectionsDelta(): number {
    return this.currentCollectionsCount - this.previousCollectionsCount;
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  getSourceId(): string {
    return `${this.env}:pah:${this.pahRepositoryName}`;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Start sync without waiting for completion. Returns true if sync was started, false if already running or error. */
  startSync(): { started: boolean; skipped: boolean; error?: string } {
    if (this.isSyncing) {
      return { started: false, skipped: true };
    }
    if (!this.connection) {
      return {
        started: false,
        skipped: false,
        error: 'Provider not connected',
      };
    }
    // Fire and forget - don't await
    this.run().catch(err => {
      this.logger.error(
        `[${this.getProviderName()}]: Background sync failed: ${
          err?.message ?? err
        }`,
      );
    });
    return { started: true, skipped: false };
  }

  createScheduleFn(
    taskRunner: SchedulerServiceTaskRunner,
  ): () => Promise<void> {
    return async () => {
      const taskId = `${this.getProviderName()}:run`;
      this.logger.info(
        `[${
          PAHCollectionProvider.pluginLogName
        }]: Creating schedule function for ${this.getProviderName()} with baseURL ${
          this.baseUrl
        }`,
      );
      return taskRunner.run({
        id: taskId,
        fn: async (signal: AbortSignal) => {
          try {
            await this.run(signal);
          } catch (error) {
            if (isError(error)) {
              // Ensure that we don't log any sensitive internal data
              this.logger.error(
                `Error while syncing PAH collections for ${this.getProviderName()}`,
                {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                  // Additional status code if available:
                  status: (error.response as { status?: string })?.status,
                },
              );
            }
          }
        },
      });
    };
  }

  async run(
    signal?: AbortSignal,
  ): Promise<{ success: boolean; collectionsCount: number }> {
    if (!this.connection) {
      throw new Error('PAHCollectionProvider not connected');
    }

    if (signal?.aborted) {
      return { success: false, collectionsCount: 0 };
    }

    this.isSyncing = true;
    try {
      this.logger.info(
        `[${this.getProviderName()}]: Starting PAH collections sync for repository: ${
          this.pahRepositoryName
        }`,
      );

      let collectionsCount = 0;
      const entities: Entity[] = [];

      const collections =
        await this.ansibleServiceRef.syncCollectionsByRepositories(
          [this.pahRepositoryName],
          100,
          signal,
        );
      this.logger.info(
        `[${this.getProviderName()}]: Fetched ${
          collections.length
        } collections from repository: ${this.pahRepositoryName}`,
      );

      if (signal?.aborted) {
        this.logger.info(
          `[${this.getProviderName()}]: Sync aborted after fetching collections, skipping catalog mutation`,
        );
        return { success: false, collectionsCount: 0 };
      }

      for (const collection of collections) {
        entities.push(
          pahCollectionParser({
            baseUrl: this.baseUrl,
            collection,
            sourceId: this.getSourceId(),
          }),
        );
        collectionsCount++;
      }

      await this.connection.applyMutation({
        type: 'full',
        entities: entities.map(entity => ({
          entity,
          locationKey: this.getProviderName(),
        })),
      });

      this.logger.info(
        `[${this.getProviderName()}]: Refreshed ${this.getProviderName()}: ${collectionsCount} collections added.`,
      );

      this.lastSyncTime = new Date().toISOString();
      this.lastSyncStatus = 'success';
      this.previousCollectionsCount = this.currentCollectionsCount;
      this.currentCollectionsCount = collectionsCount;

      return { success: true, collectionsCount };
    } catch (e: any) {
      this.logger.error(
        `[${this.getProviderName()}]: Sync failed for repository: ${
          this.pahRepositoryName
        }. ${e?.message ?? ''}`,
      );
      this.lastFailedSyncTime = new Date().toISOString();
      this.lastSyncStatus = 'failure';
      return { success: false, collectionsCount: 0 };
    } finally {
      this.isSyncing = false;
    }
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
  }
}
