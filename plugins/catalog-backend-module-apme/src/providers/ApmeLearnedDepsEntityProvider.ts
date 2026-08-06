/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  AuthService,
  LoggerService,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import {
  defaultBranchFromEntity,
  IApmeService,
  isApmeMockMode,
  normalizeRepoUrlFromEntity,
} from '@ansible/backstage-apme-common';
import {
  buildLearnedCollectionEntity,
  findCanonicalCollectionEntity,
  indexCatalogCollectionsByFqcn,
} from './learnedCollectionEntity';

const PROVIDER_NAME = 'ApmeLearnedDepsEntityProvider';
const SYNC_TASK_ID = 'apme-learned-deps-sync';

export interface ApmeLearnedDepsEntityProviderOptions {
  apmeService: IApmeService;
  catalogClient: CatalogClient;
  auth: AuthService;
  logger: LoggerService;
  rootConfig: Config;
}

/**
 * Publishes synthetic ansible-collection entities for APME learned deps,
 * linked to consuming git-repository entities via consumed-by-repository.
 */
export class ApmeLearnedDepsEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private readonly apmeService: IApmeService;
  private readonly catalogClient: CatalogClient;
  private readonly auth: AuthService;
  private readonly logger: LoggerService;
  private readonly rootConfig: Config;

  constructor(options: ApmeLearnedDepsEntityProviderOptions) {
    this.apmeService = options.apmeService;
    this.catalogClient = options.catalogClient;
    this.auth = options.auth;
    this.logger = options.logger.child({ provider: PROVIDER_NAME });
    this.rootConfig = options.rootConfig;
  }

  getProviderName(): string {
    return PROVIDER_NAME;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    this.logger.info(`${PROVIDER_NAME} connected`);
  }

  async schedule(scheduler: SchedulerService): Promise<void> {
    if (isApmeMockMode(this.rootConfig)) {
      this.logger.info(
        'APME mockMode is enabled; skipping learned deps sync schedule',
      );
      return;
    }

    scheduler.scheduleTask({
      id: SYNC_TASK_ID,
      frequency: { minutes: 30 },
      timeout: { minutes: 15 },
      fn: async () => {
        try {
          await this.runFullSync();
        } catch (error) {
          this.logger.warn(
            `Learned deps sync failed: ${(error as Error).message}`,
          );
        }
      },
    });

    this.logger.info(`Registered ${SYNC_TASK_ID} (every 30m)`);

    // Kick once after connect settles (connection may not be ready yet).
    setTimeout(() => {
      void this.runFullSync().catch(error => {
        this.logger.warn(
          `Initial learned deps sync failed: ${(error as Error).message}`,
        );
      });
    }, 15_000);
  }

  async runFullSync(): Promise<void> {
    if (!this.connection) {
      this.logger.debug('Skipping learned deps sync; provider not connected');
      return;
    }

    if (isApmeMockMode(this.rootConfig)) {
      return;
    }

    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: await this.auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });

    const [reposResponse, collectionsResponse] = await Promise.all([
      this.catalogClient.getEntities(
        { filter: [{ kind: 'Component', 'spec.type': 'git-repository' }] },
        { token },
      ),
      this.catalogClient.getEntities(
        {
          filter: [{ kind: 'Component', 'spec.type': 'ansible-collection' }],
        },
        { token },
      ),
    ]);

    const repos = reposResponse.items;
    const catalogIndex = indexCatalogCollectionsByFqcn(
      collectionsResponse.items,
    );
    const entities: Entity[] = [];

    for (const repo of repos) {
      const repoUrl = normalizeRepoUrlFromEntity(repo);
      if (!repoUrl) {
        continue;
      }
      const branch = defaultBranchFromEntity(repo);

      let project;
      try {
        project = await this.apmeService.getProjectByRepoUrl(repoUrl, branch);
      } catch (error) {
        this.logger.debug(
          `No APME project for ${repoUrl}: ${(error as Error).message}`,
        );
        continue;
      }
      if (!project) {
        continue;
      }

      let dependencies;
      try {
        dependencies = await this.apmeService.getProjectDependencies(
          project.id,
        );
      } catch (error) {
        this.logger.debug(
          `No dependencies for project ${project.id}: ${(error as Error).message}`,
        );
        continue;
      }

      for (const collection of dependencies.collections ?? []) {
        const canonical = findCanonicalCollectionEntity(
          catalogIndex,
          collection.fqcn,
          collection.version,
        );
        const entity = buildLearnedCollectionEntity({
          repoEntity: repo,
          projectId: project.id,
          collection,
          canonicalEntityName: canonical?.metadata?.name,
        });
        if (entity) {
          entities.push(entity);
        }
      }
    }

    await this.connection.applyMutation({
      type: 'full',
      entities: entities.map(entity => ({
        entity,
        locationKey: PROVIDER_NAME,
      })),
    });

    this.logger.info(
      `Learned deps sync applied ${entities.length} collection entit${entities.length === 1 ? 'y' : 'ies'} for ${repos.length} git-repositor${repos.length === 1 ? 'y' : 'ies'}`,
    );
  }
}
