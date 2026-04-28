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
  IJobTemplate,
  ISurvey,
  InstanceGroup,
} from '@ansible/backstage-rhaap-common';
import { Entity } from '@backstage/catalog-model';
import { aapJobTemplateParser } from './entityParser';
import { getEffectiveNamespace, validateNamespace } from '../helpers';

export class AAPJobTemplateProvider implements EntityProvider {
  private readonly env: string;
  private readonly baseUrl: string;
  private readonly orgs: string[];
  private readonly surveyEnabled: boolean | undefined;
  private readonly jobTemplateLabels: string[];
  private readonly jobTemplateExcludeLabels: string[];
  private readonly logger: LoggerService;
  private readonly ansibleServiceRef: IAAPService;
  private readonly scheduleFn: () => Promise<void>;
  private connection?: EntityProviderConnection;
  private lastSyncTime: string | null = null;

  static pluginLogName = 'plugin-catalog-rh-aap';
  static syncEntity = 'jobTemplates';

  static fromConfig(
    config: Config,
    ansibleServiceRef: IAAPService,
    options: {
      logger: LoggerService;
      schedule?: SchedulerServiceTaskRunner;
      scheduler?: SchedulerService;
    },
  ): AAPJobTemplateProvider[] {
    const { logger } = options;
    const providerConfigs = readAapApiEntityConfigs(config, this.syncEntity);
    logger.info(`Init AAP entity provider from config.`);
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
          `[${this.pluginLogName}]:No schedule provided via config for AAP Resource Entity Provider:${providerConfig.id}.`,
        );
        throw new InputError(
          `No schedule provided via config for AapResourceEntityProvider:${providerConfig.id}.`,
        );
      }
      if (!taskRunner) {
        logger.info(
          `[${this.pluginLogName}]:No schedule provided via config for AAP Resource Entity Provider:${providerConfig.id}.`,
        );
        throw new InputError(
          `No schedule provided via config for AapResourceEntityProvider:${providerConfig.id}.`,
        );
      }
      return new AAPJobTemplateProvider(
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
    this.orgs = config.organizations;
    this.surveyEnabled = config.surveyEnabled ?? undefined;
    this.jobTemplateLabels = config.jobTemplateLabels ?? [];
    this.jobTemplateExcludeLabels = config.jobTemplateExcludeLabels ?? [];
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
      this.logger.info('[${this.pluginLogName}]:Creating Schedule function.');
      return taskRunner.run({
        id: taskId,
        fn: async () => {
          try {
            await this.run();
          } catch (error) {
            if (isError(error)) {
              // Ensure that we don't log any sensitive internal data:
              this.logger.error(
                `Error while syncing resources from AAP ${this.baseUrl}`,
                {
                  // Default Error properties:
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

  getProviderName(): string {
    return `AAPJobTemplateProvider:${this.env}`;
  }

  getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  async run(): Promise<boolean> {
    if (!this.connection) {
      throw new NotFoundError('Not initialized');
    }

    if (!this.orgs || this.orgs.length === 0) {
      this.logger.warn(
        `[${AAPJobTemplateProvider.pluginLogName}]: No orgs configured in catalog.providers.rhaap.<env>.orgs — skipping job template sync. ` +
          'Add org names to enable catalog population (e.g., orgs: [Default]).',
      );
      return true;
    }

    // Validate all org namespaces at sync start
    for (const orgName of this.orgs) {
      const ns = getEffectiveNamespace(orgName, this.orgs);
      validateNamespace(ns, orgName);
    }

    const isMultiOrg = this.orgs.length > 1;
    let jobTemplateCount = 0;
    const entities: Entity[] = [];
    let aapJobTemplates: Array<{
      job: IJobTemplate;
      survey: ISurvey | null;
      instanceGroup: InstanceGroup[];
    }> = [];

    let error = false;
    try {
      aapJobTemplates = await this.ansibleServiceRef.syncJobTemplates(
        this.surveyEnabled,
        this.jobTemplateLabels,
        this.jobTemplateExcludeLabels,
      );
      this.logger.info(
        `[${AAPJobTemplateProvider.pluginLogName}]: Fetched ${aapJobTemplates.length} job templates.`,
      );
    } catch (e: any) {
      this.logger.error(
        `[${
          AAPJobTemplateProvider.pluginLogName
        }]: Error while fetching job templates. ${e?.message ?? ''}`,
      );
      error = true;
    }

    if (!error) {
      for (const { job, survey, instanceGroup } of aapJobTemplates) {
        // Filter templates to configured orgs
        const templateOrgName = job.summary_fields?.organization?.name;
        if (
          templateOrgName &&
          !this.orgs.includes(templateOrgName.toLowerCase())
        ) {
          continue;
        }

        const ns = templateOrgName
          ? getEffectiveNamespace(templateOrgName, this.orgs)
          : 'default';

        entities.push(
          aapJobTemplateParser({
            baseUrl: this.baseUrl,
            nameSpace: ns,
            job,
            survey,
            instanceGroup,
            orgName: isMultiOrg ? templateOrgName : undefined,
          }),
        );
        jobTemplateCount++;
      }

      await this.connection.applyMutation({
        type: 'full',
        entities: entities.map(entity => ({
          entity,
          locationKey: this.getProviderName(),
        })),
      });

      this.logger.info(
        `[${
          AAPJobTemplateProvider.pluginLogName
        }]: Refreshed ${this.getProviderName()}: ${jobTemplateCount} job templates added.`,
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
