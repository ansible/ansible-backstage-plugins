/*
 * Copyright Red Hat
 *
 * ADR-010: Host/guest extension contracts for Git Repositories surfaces.
 * Guest plugins register tabs and slots from packages/app — not from self-service.
 */

import { ReactNode } from 'react';
import { Entity } from '@backstage/catalog-model';
import { createApiRef } from '@backstage/core-plugin-api';

/** Context passed to optional Git Repos page tab renderers (Inc 10 fleet drill-down). */
export type GitRepositoriesPageTabContext = {
  repositoryDetailPath: (entityName: string, ruleId?: string) => string;
};

/** Optional top-level tab on the Git Repositories page (e.g. Fleet Quality). */
export type GitRepositoriesPageTabDefinition = {
  id: string;
  label: string;
  path: string;
  order: number;
  render: (context: GitRepositoriesPageTabContext) => ReactNode;
};

/** Context for entity detail Quality tab and similar extensions. */
export type GitRepositoryDetailTabContext = {
  entity: Entity;
  repoUrl: string | null;
  initialRuleFilter?: string;
};

/** Optional tab on a git-repository entity detail page. */
export type GitRepositoryDetailTabDefinition = {
  id: string;
  label: string;
  order: number;
  render: (context: GitRepositoryDetailTabContext) => ReactNode;
};

/** Optional catalog row addon (e.g. violation status chip). */
export type GitRepositoryCatalogRowContext = {
  entity: Entity;
  projectDetailPath?: string;
};

export type GitRepositoryCatalogRowSlotDefinition = {
  id: string;
  order: number;
  render: (context: GitRepositoryCatalogRowContext) => ReactNode;
};

/** Optional table column contributed by a factory plugin (e.g. violations). */
export type GitRepositoryCatalogColumnDefinition = {
  id: string;
  title: string;
  tooltip?: string;
  order: number;
  render: (entity: Entity) => ReactNode;
};

export interface GitRepositoriesExtensionsApi {
  getPageTabs(): GitRepositoriesPageTabDefinition[];
  getDetailTabs(): GitRepositoryDetailTabDefinition[];
  getCatalogRowSlots(): GitRepositoryCatalogRowSlotDefinition[];
  getCatalogColumns(): GitRepositoryCatalogColumnDefinition[];
}

export const gitRepositoriesExtensionsApiRef =
  createApiRef<GitRepositoriesExtensionsApi>({
    id: 'plugin.rhaap.git-repositories.extensions',
  });

/** Default: no optional factory plugin UI (ADR-010 zero footprint). */
export class DefaultGitRepositoriesExtensionsApi implements GitRepositoriesExtensionsApi {
  getPageTabs(): GitRepositoriesPageTabDefinition[] {
    return [];
  }

  getDetailTabs(): GitRepositoryDetailTabDefinition[] {
    return [];
  }

  getCatalogRowSlots(): GitRepositoryCatalogRowSlotDefinition[] {
    return [];
  }

  getCatalogColumns(): GitRepositoryCatalogColumnDefinition[] {
    return [];
  }
}
