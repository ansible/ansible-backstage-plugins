/*
 * Copyright Red Hat
 *
 * ADR-010: Host/guest extension contracts for Git Repositories surfaces.
 * Guest plugins register tabs and slots from packages/app — not from self-service.
 */

import { ReactNode } from 'react';
import { Entity } from '@backstage/catalog-model';
import {
  createApiFactory,
  createApiRef,
  type AnyApiFactory,
} from '@backstage/core-plugin-api';
import type { Permission } from '@backstage/plugin-permission-common';

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
  /**
   * Optional permission gate (ADR-020 capability check). When set, the host
   * page hides this tab entirely from the tab bar (and redirects away if
   * deep-linked) for unauthorized users, rather than rendering `render()`
   * behind a "missing permissions" page.
   */
  permission?: Permission;
  /** Resource ref to authorize against, required when `permission` is a `ResourcePermission`. */
  resourceRef?: string;
};

/** Optional header action on the Git Repositories list page (e.g. Add repository scaffolder). */
export type GitRepositoriesPageHeaderActionDefinition = {
  id: string;
  order: number;
  render: () => ReactNode;
};

/** Context for entity detail Quality tab and similar extensions. */
export type GitRepositoryDetailTabContext = {
  entity: Entity;
  repoUrl: string | null;
  initialRuleFilter?: string;
  initialCategoryFilter?: string;
};

/** Context for optional header action menu items on repository detail. */
export type GitRepositoryDetailHeaderMenuContext =
  GitRepositoryDetailTabContext & {
    onCloseMenu: () => void;
    /** Resolved catalog path (e.g. from rootLink()). Avoids pathname heuristics in guests. */
    repositoriesCatalogPath?: string;
  };

export type GitRepositoryDetailHeaderMenuItemDefinition = {
  id: string;
  order: number;
  render: (context: GitRepositoryDetailHeaderMenuContext) => ReactNode;
};

/**
 * Optional slot on the Overview tab sidebar, rendered above About
 * (e.g. quality summary card).
 */
export type GitRepositoryDetailOverviewSlotDefinition = {
  id: string;
  order: number;
  render: (context: GitRepositoryDetailTabContext) => ReactNode;
};

/** Optional tab on a git-repository entity detail page. */
export type GitRepositoryDetailTabDefinition = {
  id: string;
  label: string;
  order: number;
  render: (context: GitRepositoryDetailTabContext) => ReactNode;
  /** Optional tab label (e.g. severity-colored violation count on Quality). */
  renderLabel?: (context: GitRepositoryDetailTabContext) => ReactNode;
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

/** Context for optional Actions kebab items on the Git Repositories list. */
export type GitRepositoryCatalogRowMenuContext = {
  entity: Entity;
  onCloseMenu: () => void;
  /** Resolved catalog path (e.g. from rootLink()). Used for post-deregister redirect. */
  repositoriesCatalogPath?: string;
};

export type GitRepositoryCatalogRowMenuItemDefinition = {
  id: string;
  order: number;
  render: (context: GitRepositoryCatalogRowMenuContext) => ReactNode;
};

/** Optional table column contributed by a factory plugin (e.g. violations). */
export type GitRepositoryCatalogColumnDefinition = {
  id: string;
  title: string;
  tooltip?: string;
  order: number;
  render: (entity: Entity) => ReactNode;
};

/**
 * Persistent overlay on the repository detail page (outside the Actions Menu).
 * Use for dialogs that must survive menu close (e.g. remove confirmation).
 */
export type GitRepositoryDetailOverlayDefinition = {
  id: string;
  order: number;
  render: (context: GitRepositoryDetailTabContext) => ReactNode;
};

/**
 * Persistent overlay on the Git Repositories catalog list (outside the kebab Menu).
 * Use for dialogs that must survive menu close (e.g. deregister confirmation).
 */
export type GitRepositoryCatalogOverlayDefinition = {
  id: string;
  order: number;
  render: () => ReactNode;
};

export interface GitRepositoriesExtensionsApi {
  getPageTabs(): GitRepositoriesPageTabDefinition[];
  getPageHeaderActions(): GitRepositoriesPageHeaderActionDefinition[];
  getDetailTabs(): GitRepositoryDetailTabDefinition[];
  getDetailOverviewSlots(): GitRepositoryDetailOverviewSlotDefinition[];
  getDetailHeaderMenuItems(): GitRepositoryDetailHeaderMenuItemDefinition[];
  getDetailOverlays(): GitRepositoryDetailOverlayDefinition[];
  getCatalogOverlays(): GitRepositoryCatalogOverlayDefinition[];
  getCollectionsTabContent(
    context: GitRepositoryDetailTabContext,
  ): ReactNode | null;
  getCatalogRowSlots(): GitRepositoryCatalogRowSlotDefinition[];
  getCatalogRowMenuItems(): GitRepositoryCatalogRowMenuItemDefinition[];
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

  getPageHeaderActions(): GitRepositoriesPageHeaderActionDefinition[] {
    return [];
  }

  getDetailTabs(): GitRepositoryDetailTabDefinition[] {
    return [];
  }

  getDetailOverviewSlots(): GitRepositoryDetailOverviewSlotDefinition[] {
    return [];
  }

  getDetailHeaderMenuItems(): GitRepositoryDetailHeaderMenuItemDefinition[] {
    return [];
  }

  getDetailOverlays(): GitRepositoryDetailOverlayDefinition[] {
    return [];
  }

  getCatalogOverlays(): GitRepositoryCatalogOverlayDefinition[] {
    return [];
  }

  getCollectionsTabContent(
    _context: GitRepositoryDetailTabContext,
  ): ReactNode | null {
    return null;
  }

  getCatalogRowSlots(): GitRepositoryCatalogRowSlotDefinition[] {
    return [];
  }

  getCatalogRowMenuItems(): GitRepositoryCatalogRowMenuItemDefinition[] {
    return [];
  }

  getCatalogColumns(): GitRepositoryCatalogColumnDefinition[] {
    return [];
  }
}

/** Host default for RHDH when no guest plugin registers extensions (ADR-010). */
export const defaultGitRepositoriesExtensionsApiFactory: AnyApiFactory =
  createApiFactory({
    api: gitRepositoriesExtensionsApiRef,
    deps: {},
    factory: () => new DefaultGitRepositoriesExtensionsApi(),
  });
