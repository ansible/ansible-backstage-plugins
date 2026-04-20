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
import { InputError, isError, NotFoundError } from '@backstage/errors';
import { AapConfig } from './types';
import {
  IAAPService,
  IWorkflowJobTemplate,
  ISurvey,
} from '@ansible/backstage-rhaap-common';
import { Entity } from '@backstage/catalog-model';
import { aapWorkflowJobTemplateParser } from './entityParser';

export class AAPWorkflowJobTemplateProvider implements EntityProvider {
  private readonly env: string;
  private readonly baseUrl: string;
  private readonly surveyEnabled: boolean | undefined;
  private readonly workflowJobTemplateLabels: string[];
  private readonly workflowJobTemplateExcludeLabels: string[];
  private readonly logger: LoggerService;
  private readonly ansibleServiceRef: IAAPService;
  private readonly scheduleFn: () => Promise<void>;
  private connection?: EntityProviderConnection;
  private lastSyncTime: string | null = null;

  static pluginLogName = 'plugin-catalog-rh-aap';
  static syncEntity = 'workflowJobTemplates';

  static fromConfig(
    config: Config,
    ansibleServiceRef: IAAPService,
    options: {
      logger: LoggerService;
      schedule?: SchedulerServiceTaskRunner;
      scheduler?: SchedulerService;
    },
  ): AAPWorkflowJobTemplateProvider[] {
    const { logger } = options;
    const providerConfigs = readAapApiEntityConfigs(config, this.syncEntity);
    logger.info(`Init AAP workflow job template entity provider from config.`);
    return providerConfigs.map(providerConfig => {
      let taskRunner;
      if ('scheduler' in options && providerConfig.schedule) {
        taskRunner = options.scheduler!.createScheduledTaskRunner(
          providerConfig.schedule,
        );
      } else if ('schedule' in options) {
        taskRunner = options.schedule;
      } else {
        logger.info(
          `[${this.pluginLogName}]: No schedule provided via config for AAP workflow job template provider: ${providerConfig.id}.`,
        );
        throw new InputError(
          `No schedule provided via config for AapResourceEntityProvider workflow job templates: ${providerConfig.id}.`,
        );
      }
      if (!taskRunner) {
        throw new InputError(
          `No schedule provided via config for AapResourceEntityProvider workflow job templates: ${providerConfig.id}.`,
        );
      }
      return new AAPWorkflowJobTemplateProvider(
        providerConfig,
        logger,
        taskRunner,
        ansibleServiceRef,
      );
    });
  }

  private constructor(
    config: AapConfig,
    logger: LoggerService,
    taskRunner: SchedulerServiceTaskRunner,
    ansibleServiceRef: IAAPService,
  ) {
    this.env = config.id;
    this.baseUrl = config.baseUrl;
    this.surveyEnabled = config.surveyEnabled ?? undefined;
    this.workflowJobTemplateLabels = config.workflowJobTemplateLabels ?? [];
    this.workflowJobTemplateExcludeLabels =
      config.workflowJobTemplateExcludeLabels ?? [];
    this.logger = logger.child({
      target: this.getProviderName(),
    });
    this.ansibleServiceRef = ansibleServiceRef;

    this.scheduleFn = this.createScheduleFn(taskRunner);
  }

  createScheduleFn(
    taskRunner: SchedulerServiceTaskRunner,
  ): () => Promise<void> {
    return async () => {
      const taskId = `${this.getProviderName()}:run`;
      this.logger.info(
        'Creating schedule function for workflow job templates.',
      );
      return taskRunner.run({
        id: taskId,
        fn: async () => {
          try {
            await this.run();
          } catch (error) {
            if (isError(error)) {
              this.logger.error(
                `Error while syncing workflow job templates from AAP ${this.baseUrl}`,
                {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                  status: (error.response as { status?: string })?.status,
                },
              );
            }
          }
        },
      });
    };
  }

  getProviderName(): string {
    return `AAPWorkflowJobTemplateProvider:${this.env}`;
  }

  getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  async run(): Promise<boolean> {
    if (!this.connection) {
      throw new NotFoundError('Not initialized');
    }
    let count = 0;
    const entities: Entity[] = [];
    let aapWfTemplates: Array<{
      workflow: IWorkflowJobTemplate;
      survey: ISurvey | null;
    }> = [];

    let error = false;
    try {
      aapWfTemplates = await this.ansibleServiceRef.syncWorkflowJobTemplates(
        this.surveyEnabled,
        this.workflowJobTemplateLabels,
        this.workflowJobTemplateExcludeLabels,
      );
      this.logger.info(
        `[${AAPWorkflowJobTemplateProvider.pluginLogName}]: Fetched ${aapWfTemplates.length} workflow job templates.`,
      );
    } catch (e: any) {
      this.logger.error(
        `[${AAPWorkflowJobTemplateProvider.pluginLogName}]: Error while fetching workflow job templates. ${e?.message ?? ''}`,
      );
      error = true;
    }

    if (!error) {
      for (const { workflow, survey } of aapWfTemplates) {
        entities.push(
          aapWorkflowJobTemplateParser({
            baseUrl: this.baseUrl,
            nameSpace: 'default',
            workflow,
            survey,
          }),
        );
        count++;
      }

      await this.connection.applyMutation({
        type: 'full',
        entities: entities.map(entity => ({
          entity,
          locationKey: this.getProviderName(),
        })),
      });

      this.logger.info(
        `[${AAPWorkflowJobTemplateProvider.pluginLogName}]: Refreshed ${this.getProviderName()}: ${count} workflow job templates.`,
      );

      this.lastSyncTime = new Date().toISOString();
    }
    return !error;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
  }
}
