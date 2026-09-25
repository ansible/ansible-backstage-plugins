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
import type { SignalsService } from '@backstage/plugin-signals-node';
import { deduplicateCatalogEntities } from './deduplicateCatalogEntities';

export class AAPJobTemplateProvider implements EntityProvider {
  private readonly env: string;
  private readonly baseUrl: string;
  private readonly orgs: string[];
  private readonly multiOrgEnabled: boolean;
  private readonly surveyEnabled: boolean | undefined;
  private readonly jobTemplateLabels: string[];
  private readonly jobTemplateExcludeLabels: string[];
  private readonly logger: LoggerService;
  private readonly ansibleServiceRef: IAAPService;
  private readonly scheduleFn: () => Promise<void>;
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
    this.multiOrgEnabled = config.multiOrgEnabled;
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

  setSignals(signals: SignalsService): void {
    this.syncState.setSignals(signals, `aap-job-template:${this.env}`);
  }

  getLastFailedSyncTime(): string | null {
    return this.syncState.getLastFailedSyncTime();
  }

  getLastSyncStatus(): 'success' | 'failure' | null {
    return this.syncState.getLastSyncStatus();
  }

  getLastDuplicateEntityCount(): number {
    return this.syncState.getLastDuplicateEntityCount();
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

    if (!this.multiOrgEnabled) {
      for (const orgName of this.orgs) {
        validateNamespace(getEffectiveNamespace(orgName, this.orgs), orgName);
      }
    }

    const isMultiOrg = this.multiOrgEnabled;

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

        const templateOrgId = job.summary_fields?.organization?.id;
        const identity = {
          multiOrgEnabled: this.multiOrgEnabled,
          orgId: templateOrgId,
        };
        const ns = templateOrgName
          ? getEffectiveNamespace(templateOrgName, this.orgs, identity)
          : 'default';

        entities.push(
          aapJobTemplateParser({
            baseUrl: this.baseUrl,
            nameSpace: ns,
            job,
            survey,
            instanceGroup,
            orgName: isMultiOrg ? templateOrgName : undefined,
            ownerOrgName: templateOrgName,
            identity,
          }),
        );
        jobTemplateCount++;
      }

      const { entities: uniqueEntities, duplicateEntityCount } =
        deduplicateCatalogEntities(
          entities,
          this.logger,
          AAPJobTemplateProvider.pluginLogName,
        );

      await this.connection.applyMutation({
        type: 'full',
        entities: uniqueEntities.map(entity => ({
          entity,
          locationKey: this.getProviderName(),
        })),
      });

      this.logger.info(
        `[${
          AAPJobTemplateProvider.pluginLogName
        }]: Refreshed ${this.getProviderName()}: ${jobTemplateCount} job templates added.`,
      );

      this.syncState.markSyncSucceeded(duplicateEntityCount);
      return true;
    } catch (e) {
      this.syncState.markSyncFailed();
      throw e;
    }
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.scheduleFn();
  }
}
