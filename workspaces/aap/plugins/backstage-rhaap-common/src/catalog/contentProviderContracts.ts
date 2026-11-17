/*
 * Copyright 2026 The Ansible plugin Authors
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
import type { Config } from '@backstage/config';
import type {
  LoggerService,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import type { EntityProvider } from '@backstage/plugin-catalog-node';
import type { IAAPService } from '@ansible/aap-node';
import type { SyncStatus } from './providers/SyncStateTracker';

/** PAH collection catalog provider surface used by the shared sync router. */
export interface ContentPahCollectionProvider extends EntityProvider {
  getSourceId(): string;
  getPahRepositoryName(): string;
  isEnabled(): boolean;
  getIsSyncing(): boolean;
  getLastSyncTime(): string | null;
  getLastFailedSyncTime(): string | null;
  getLastSyncStatus(): SyncStatus;
  getCurrentCollectionsCount(): number;
  getCollectionsDelta(): number;
  getTaskId(): string | undefined;
  runFullSync?(): Promise<void>;
}

/** Ansible Git SCM catalog provider surface used by the shared sync router. */
export interface ContentAnsibleGitContentsProvider extends EntityProvider {
  getSourceId(): string;
  isEnabled(): boolean;
  getIsSyncing(): boolean;
  getLastSyncTime(): string | null;
  getLastFailedSyncTime(): string | null;
  getLastSyncStatus(): SyncStatus;
  getCurrentCollectionsCount(): number;
  getCollectionsDelta(): number;
  getTaskId(): string | undefined;
  runFullSync?(): Promise<void>;
}

/** Self-service execution environment provider surface used by the shared router. */
export interface ContentEeEntityProvider extends EntityProvider {
  registerExecutionEnvironment(entity: unknown): Promise<void>;
  unregisterExecutionEnvironment(name: string): Promise<void>;
}

export interface ContentCatalogProviders {
  eeEntityProvider?: ContentEeEntityProvider;
  pahCollectionProviders: ContentPahCollectionProvider[];
  ansibleGitContentsProviders: ContentAnsibleGitContentsProvider[];
}

export interface ContentCatalogProviderInitContext {
  config: Config;
  logger: LoggerService;
  scheduler: SchedulerService;
  ansibleService: IAAPService;
}

export interface ContentCatalogRegistration {
  createProviders(
    ctx: ContentCatalogProviderInitContext,
  ): Promise<ContentCatalogProviders>;
}
