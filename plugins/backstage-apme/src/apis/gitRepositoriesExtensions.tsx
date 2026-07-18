/*
 * Copyright Red Hat
 *
 * ADR-010: APME guest registers Git Repositories extension API for OCI/dynamic plugin mode.
 * Monolith dev uses packages/app/src/apis/gitRepositoriesExtensions.tsx — keep in sync
 * (factories only; ApmeViolationsCell lives in ./apmeViolationsCell).
 */

import { FleetQualityTab } from '../components/FleetQualityTab';
import { ApmeQualitySettingsTab } from '../components/ApmeQualitySettingsTab';
import { EntityQualityTab } from '../components/EntityQualityTab';
import { ApmeRepositoryOverviewCard } from '../components/ApmeRepositoryOverviewCard/ApmeRepositoryOverviewCard';
import { DependenciesTab } from '../components/DependenciesTab/DependenciesTab';
import { ApmeRepositoryCollectionsTab } from '../components/ApmeRepositoryCollectionsTab/ApmeRepositoryCollectionsTab';
import { ApmeRepositoryHeaderActions } from '../components/ApmeRepositoryHeaderActions/ApmeRepositoryHeaderActions';
import { ApmeRemoveRepositoryDialog } from '../components/ApmeRemoveRepositoryDialog/ApmeRemoveRepositoryDialog';
import { ApmeViolationsCell } from './apmeViolationsCell';
import {
  createApmeGitRepositoriesExtensionsApi,
  createGitRepositoriesExtensionsApiFactory,
  withSuspense,
} from './apmeGitRepositoriesExtensionsCore';

const ApmeGitRepositoriesExtensionsApi = createApmeGitRepositoriesExtensionsApi({
  FleetQualityTab: withSuspense(FleetQualityTab),
  ApmeQualitySettingsTab: withSuspense(ApmeQualitySettingsTab),
  EntityQualityTab: withSuspense(EntityQualityTab),
  DependenciesTab: withSuspense(DependenciesTab),
  ApmeRepositoryOverviewCard: withSuspense(ApmeRepositoryOverviewCard),
  ApmeRepositoryCollectionsTab: withSuspense(ApmeRepositoryCollectionsTab),
  ApmeRepositoryHeaderActions: withSuspense(ApmeRepositoryHeaderActions),
  ApmeRemoveRepositoryDialog: withSuspense(ApmeRemoveRepositoryDialog),
  ApmeViolationsCell,
});

export const gitRepositoriesExtensionsApiFactory =
  createGitRepositoriesExtensionsApiFactory(ApmeGitRepositoriesExtensionsApi);
