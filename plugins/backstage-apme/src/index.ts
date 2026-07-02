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
  ApmePage,
  ApmeProjectPage,
  ApmeHealthCard,
  ApmeViolationsTable,
  ApmeEntityTab,
  ApmeRepoStatusChip,
  ApmeAdminCard,
  ApmeEnabledEntityLayoutRoute,
  ApmeQualitySettingsTab,
  ApmeFleetQualityTab,
  rootRouteRef as apmeRouteRef,
  projectRouteRef as apmeProjectRouteRef,
} from './plugin';
export { CreateProjectDialog } from './components/CreateProjectDialog';
export { ApmeRepoStatusChip as ApmeRepoStatusChipComponent } from './components/ApmeRepoStatusChip';
export { ApmeAdminCard as ApmeAdminCardComponent } from './components/ApmeAdminCard';
export { ApmeQualitySettingsTab as ApmeQualitySettingsTabComponent } from './components/ApmeQualitySettingsTab';
export { FleetQualityTab as ApmeFleetQualityTabComponent } from './components/FleetQualityTab';
export { EntityQualityTab as ApmeEntityQualityTabComponent } from './components/EntityQualityTab';
export type { FleetQualityTabProps as ApmeFleetQualityTabProps } from './components/FleetQualityTab';
export { PreviewChip as PreviewChipComponent } from './components/PreviewChip';
export { ApmeEnabledEntityLayoutRoute as ApmeEnabledEntityLayoutRouteComponent } from './components/ApmeEnabledEntityLayoutRoute';
export { apmeApiRef, ApmeApiClient } from './api';
export type { ApmeApi } from './api';
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
