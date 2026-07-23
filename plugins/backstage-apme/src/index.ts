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

export {
  apmePlugin,
  ApmeEntityTab,
  ApmeEnabledEntityLayoutRoute,
  QualityTabExtension,
  rootRouteRef as apmeRouteRef,
} from './plugin';
export { QualityTab } from './components/QualityTab';
export { EntityQualityTab as ApmeEntityQualityTabComponent } from './components/EntityQualityTab';
export { apmeApiRef, ApmeApiClient } from './api';
export { apmeApiFactory } from './api/apmeApiFactory';
export type { ApmeApi } from './api';
export { createApmeUiWorkflowAdapter } from './api/createApmeUiWorkflowAdapter';
export {
  normalizeRepoUrlFromEntity,
  defaultBranchFromEntity,
  scmOrganizationFromEntity,
} from '@ansible/backstage-apme-common/catalogEntity';
export {
  normalizeSourceLocation,
  normalizeRepoUrl,
} from '@ansible/backstage-apme-common/normalizeRepoUrl';
export { useApmeEnabled } from './hooks/useApmeEnabled';
