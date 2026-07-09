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
import { NotFoundError } from '@backstage/errors';
import { AapConfig } from './types';
import {
  IAAPService,
  IJobTemplate,
  ISurvey,
  InstanceGroup,
} from '@ansible/backstage-rhaap-common';
import { Entity } from '@backstage/catalog-model';
import { aapJobTemplateParser } from './entityParser';
import { resolveTaskRunner } from './helpers';
import { SyncStateTracker } from './SyncStateTracker';
import { getEffectiveNamespace, validateNamespace } from '../helpers';
import { executePermissionStore } from '../permissions/executePermissionStore';

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
  private readonly scheduler?: SchedulerService;
  private connection?: EntityProviderConnection;
  private readonly syncState = new SyncStateTracker();

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
      const taskRunner = resolveTaskRunner(
        options,
        providerConfig.schedule,
        this.pluginLogName,
        providerConfig.id,
      );
      return new AAPJobTemplateProvider(
        providerConfig,
        logger,
        taskRunner,
        ansibleServiceRef,
        options.scheduler,
      );
    });
  }

  private readonly executePermissionsFrequency: { minutes: number };

  private constructor(
    config: AapConfig,
    logger: LoggerService,
    taskRunner: SchedulerServiceTaskRunner,
    ansibleServiceRef: IAAPService,
    scheduler?: SchedulerService,
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
    this.scheduler = scheduler;
    this.executePermissionsFrequency = (config.executePermissionsSchedule
      ?.frequency as { minutes: number }) ?? { minutes: 40 };

    this.scheduleFn = this.createScheduleFn(taskRunner);
  }

  createScheduleFn(
    taskRunner: SchedulerServiceTaskRunner,
  ): () => Promise<void> {
    this.logger.info('[${this.pluginLogName}]:Creating Schedule function.');
    return this.syncState.createScheduleFn(
      taskRunner,
      this.getProviderName(),
      () => this.run(),
      this.logger,
      `AAP ${this.baseUrl}`,
    );
  }

  getProviderName(): string {
    return `AAPJobTemplateProvider:${this.env}`;
  }

  getLastSyncTime(): string | null {
    return this.syncState.getLastSyncTime();
  }

  getLastFailedSyncTime(): string | null {
    return this.syncState.getLastFailedSyncTime();
  }

  getLastSyncStatus(): 'success' | 'failure' | null {
    return this.syncState.getLastSyncStatus();
  }

  getIsSyncing(): boolean {
    return this.syncState.getIsSyncing();
  }

  getTaskId(): string | undefined {
    return this.syncState.getTaskId();
  }

  async run(): Promise<boolean> {
    if (!this.connection) {
      throw new NotFoundError('Not initialized');
    }

    for (const orgName of this.orgs) {
      const ns = getEffectiveNamespace(orgName, this.orgs);
      validateNamespace(ns, orgName);
    }

    const isMultiOrg = this.orgs.length > 1;

    this.syncState.markSyncStarted();
    try {
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

      try {
        const executeMap =
          await this.ansibleServiceRef.getJobTemplateExecuteMap();
        executePermissionStore.update(executeMap);
        this.logger.info(
          `[${AAPJobTemplateProvider.pluginLogName}]: Updated execute permission store with ${executeMap.size} templates.`,
        );
      } catch (e: any) {
        this.logger.warn(
          `[${AAPJobTemplateProvider.pluginLogName}]: Could not update execute permission store. ${e?.message ?? ''}`,
        );
      }

      if (error) {
        this.syncState.markSyncFailed();
        return false;
      }

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

      this.syncState.markSyncSucceeded();
      return true;
    } catch (e) {
      this.syncState.markSyncFailed();
      throw e;
    }
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
    this.startPermissionStoreRefresh();
  }

  private startPermissionStoreRefresh(): void {
    if (!this.scheduler) return;
    this.scheduler
      .scheduleTask({
        id: `aap-execute-permission-refresh:${this.env}`,
        frequency: this.executePermissionsFrequency,
        timeout: { minutes: 5 },
        scope: 'local',
        fn: async () => {
          try {
            const executeMap =
              await this.ansibleServiceRef.getJobTemplateExecuteMap();
            executePermissionStore.update(executeMap);
            this.logger.info(
              `[${AAPJobTemplateProvider.pluginLogName}]: Refreshed execute permission store (local) with ${executeMap.size} templates.`,
            );
          } catch (e: any) {
            this.logger.warn(
              `[${AAPJobTemplateProvider.pluginLogName}]: Failed to refresh execute permission store. ${e?.message ?? ''}`,
            );
          }
        },
      })
      .catch(e => {
        this.logger.warn(
          `[${AAPJobTemplateProvider.pluginLogName}]: Could not schedule execute permission refresh. ${e?.message ?? ''}`,
        );
      });
  }
}
