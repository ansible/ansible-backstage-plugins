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
  ApmeRepositoryOverviewCard,
  ApmeRepositoryHeaderActions,
} from '@ansible/plugin-backstage-apme';

const ApmeGitRepositoriesExtensionsApi = createApmeGitRepositoriesExtensionsApi(
  {
    EntityQualityTab: withSuspense(ApmeEntityQualityTabComponent),
    ApmeRepositoryOverviewCard: withSuspense(ApmeRepositoryOverviewCard),
    ApmeRepositoryHeaderActions: withSuspense(ApmeRepositoryHeaderActions),
    ApmeViolationsCell,
  },
);

export const gitRepositoriesExtensionsApiFactory =
  createGitRepositoriesExtensionsApiFactory(ApmeGitRepositoriesExtensionsApi);
