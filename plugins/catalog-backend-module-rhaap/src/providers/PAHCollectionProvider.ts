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
import { InputError } from '@backstage/errors';
import { AapConfig, type PAHRepositoryConfig } from './types';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import { ICollection } from '@ansible/backstage-rhaap-common';

export class PAHCollectionProvider implements EntityProvider {
  private readonly env: string;
  private readonly baseUrl: string;
  private readonly pahRepositoryName: string;
  private readonly logger: LoggerService;
  private readonly ansibleServiceRef: IAAPService;
  private readonly scheduleFn: () => Promise<void>;
  private connection?: EntityProviderConnection;
  private lastSyncTime: string | null = null;

  static pluginLogName = 'plugin-catalog-rh-aap';
  static syncEntity = 'pahCollections';

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

    // loop over all parsed AapConfig objects (with unique authEnv/configId)
    // for each AapConfig object, loop over all pahRepositories
    // create a new PAHCollectionProvider object for each pahRepository
    return providerConfigs.flatMap(providerConfig => {
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
    return `PAHCollectionProvider:${this.env}`;
  }

  getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  createScheduleFn(
    taskRunner: SchedulerServiceTaskRunner,
  ): () => Promise<void> {
    return async () => {
      const taskId = `${this.getProviderName()}:run`;
      this.logger.info(
        `[${PAHCollectionProvider.pluginLogName}]: Base URL: ${this.baseUrl}`,
      );
      this.logger.info(
        `[${PAHCollectionProvider.pluginLogName}]: Creating schedule function.`,
      );
      return taskRunner.run({
        id: taskId,
        fn: async () => {
          await this.run();
        },
      });
    };
  }

  async run(): Promise<ICollection[]> {
    if (!this.connection) {
      throw new Error('PAHCollectionProvider not connected');
    }
    this.logger.info('Starting PAH collections sync');
    const collections =
      await this.ansibleServiceRef.getCollectionsByRepositories([
        this.pahRepositoryName,
      ]);
    return collections;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
  }
}
