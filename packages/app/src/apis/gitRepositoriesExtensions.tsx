/*
 * Copyright Red Hat
 *
 * ADR-010: Composition root registers optional APME Git Repos extensions for monolith.
 * Keep factory wiring in sync with plugins/backstage-apme/src/apis/gitRepositoriesExtensions.tsx
 */

import {
  createApmeGitRepositoriesExtensionsApi,
  createGitRepositoriesExtensionsApiFactory,
  withSuspense,
  ApmeViolationsCell,
  ApmeEntityQualityTabComponent,
  ApmeEntityQualityActivityTabComponent,
  ApmeDependenciesTabComponent,
  ApmeFleetQualityTabComponent,
  ApmeRepositoryOverviewCard,
  ApmeRepositoryHeaderActions,
} from '@ansible/plugin-backstage-apme';

const ApmeGitRepositoriesExtensionsApi = createApmeGitRepositoriesExtensionsApi(
  {
    FleetQualityTab: withSuspense(ApmeFleetQualityTabComponent),
    EntityQualityTab: withSuspense(ApmeEntityQualityTabComponent),
    EntityQualityActivityTab: withSuspense(
      ApmeEntityQualityActivityTabComponent,
    ),
    DependenciesTab: withSuspense(ApmeDependenciesTabComponent),
    ApmeRepositoryOverviewCard: withSuspense(ApmeRepositoryOverviewCard),
    ApmeRepositoryHeaderActions: withSuspense(ApmeRepositoryHeaderActions),
    ApmeViolationsCell,
  },
);

export const gitRepositoriesExtensionsApiFactory =
  createGitRepositoriesExtensionsApiFactory(ApmeGitRepositoriesExtensionsApi);
