/*
 * Copyright Red Hat
 *
 * ADR-010: APME guest registers Git Repositories extension API for OCI/dynamic plugin mode.
 * Monolith uses packages/app/src/apis/gitRepositoriesExtensions.tsx — keep in sync.
 */

import { EntityQualityTab } from '../components/EntityQualityTab';
import { ApmeRepositoryHeaderActions } from '../components/ApmeRepositoryHeaderActions/ApmeRepositoryHeaderActions';
import { ApmeRepoStatusChip } from '../components/ApmeRepoStatusChip';
import { ApmeViolationsCell } from './apmeViolationsCell';
import {
  createApmeGitRepositoriesExtensionsApi,
  createGitRepositoriesExtensionsApiFactory,
  withSuspense,
} from './apmeGitRepositoriesExtensionsCore';

const ApmeGitRepositoriesExtensionsApi = createApmeGitRepositoriesExtensionsApi(
  {
    EntityQualityTab: withSuspense(EntityQualityTab),
    ApmeRepositoryHeaderActions: withSuspense(ApmeRepositoryHeaderActions),
    ApmeRepoStatusChip: withSuspense(ApmeRepoStatusChip),
    ApmeViolationsCell,
  },
);

export const gitRepositoriesExtensionsApiFactory =
  createGitRepositoriesExtensionsApiFactory(ApmeGitRepositoriesExtensionsApi);
