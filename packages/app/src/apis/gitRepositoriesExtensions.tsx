/*
 * Copyright Red Hat
 *
 * ADR-010: Composition root registers optional factory plugin UI for Git Repos surfaces.
 * Keep factory wiring in sync with plugins/backstage-apme/src/apis/gitRepositoriesExtensions.tsx
 * (ApmeViolationsCell shared via @ansible/plugin-backstage-apme).
 */

import { lazy } from 'react';
import {
  createApmeGitRepositoriesExtensionsApi,
  createGitRepositoriesExtensionsApiFactory,
  withSuspense,
} from '@ansible/plugin-backstage-apme';
import { ApmeViolationsCell } from '@ansible/plugin-backstage-apme';

const LazyApmeFleetQualityTab = lazy(() =>
  import('@ansible/plugin-backstage-apme').then(module => ({
    default: module.ApmeFleetQualityTabComponent,
  })),
);

const LazyApmeQualitySettingsTab = lazy(() =>
  import('@ansible/plugin-backstage-apme').then(module => ({
    default: module.ApmeQualitySettingsTabComponent,
  })),
);

const LazyEntityQualityTab = lazy(() =>
  import('@ansible/plugin-backstage-apme').then(module => ({
    default: module.ApmeEntityQualityTabComponent,
  })),
);

const LazyApmeRepositoryOverviewCard = lazy(() =>
  import('@ansible/plugin-backstage-apme').then(module => ({
    default: module.ApmeRepositoryOverviewCardComponent,
  })),
);

const LazyDependenciesTab = lazy(() =>
  import('@ansible/plugin-backstage-apme').then(module => ({
    default: module.ApmeDependenciesTabComponent,
  })),
);

const LazyApmeRepositoryCollectionsTab = lazy(() =>
  import('@ansible/plugin-backstage-apme').then(module => ({
    default: module.ApmeRepositoryCollectionsTabComponent,
  })),
);

const LazyApmeRepositoryHeaderActions = lazy(() =>
  import('@ansible/plugin-backstage-apme').then(module => ({
    default: module.ApmeRepositoryHeaderActionsComponent,
  })),
);

const LazyApmeRemoveRepositoryDialog = lazy(() =>
  import('@ansible/plugin-backstage-apme').then(module => ({
    default: module.ApmeRemoveRepositoryDialogComponent,
  })),
);

const ApmeGitRepositoriesExtensionsApi = createApmeGitRepositoriesExtensionsApi({
  FleetQualityTab: withSuspense(LazyApmeFleetQualityTab),
  ApmeQualitySettingsTab: withSuspense(LazyApmeQualitySettingsTab),
  EntityQualityTab: withSuspense(LazyEntityQualityTab),
  ApmeRepositoryOverviewCard: withSuspense(LazyApmeRepositoryOverviewCard),
  DependenciesTab: withSuspense(LazyDependenciesTab),
  ApmeRepositoryCollectionsTab: withSuspense(LazyApmeRepositoryCollectionsTab),
  ApmeRepositoryHeaderActions: withSuspense(LazyApmeRepositoryHeaderActions),
  ApmeRemoveRepositoryDialog: withSuspense(LazyApmeRemoveRepositoryDialog),
  ApmeViolationsCell,
});

export const gitRepositoriesExtensionsApiFactory =
  createGitRepositoriesExtensionsApiFactory(ApmeGitRepositoriesExtensionsApi);
