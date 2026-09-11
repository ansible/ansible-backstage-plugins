/*
 * Copyright Red Hat
 *
 * ADR-010: Host/guest extension contracts for Git Repositories surfaces.
 *
 * Host (this package + self-service) registers the empty default factory so
 * zero-guest RHDH / yarn start still have a bound apiRef. Guest plugins
 * replace that factory from packages/app or Janus `apiFactories` — they
 * must not be imported by self-service (ADR-010 rule 5).
 *
 * Single factory: `gitRepositoriesExtensionsApiRef` binds one implementation
 * app-wide. This host ships zero-or-one guest. A second independent guest
 * cannot register alongside the first without a composite factory (no
 * cross-plugin deps). See the apiRef JSDoc.
 *
 * `id` must be unique within each getter's returned array. Prefix with the
 * guest plugin id (`plugin.<name>.<slot>.<item>`) so a future composite
 * factory can merge guests without collisions. The host uses `id` as React
 * keys and for tab-selection matching.
 *
 * `order` is global only for page tabs and detail tabs (merged with core
 * tabs and sorted together). Every other slot inserts guest contributions
 * at a fixed host position; `order` then ranks those guests relative to
 * each other, not relative to core columns/actions.
 *
 * @alpha Not independently versioned. `@ansible/backstage-rhaap-common` is
 * private (`workspace:^`). Out-of-repo guests should treat this surface as
 * unstable until the package is published with a semver.
 */

import type { ReactNode } from 'react';
import type { Entity } from '@backstage/catalog-model';
import {
  createApiFactory,
  createApiRef,
  type AnyApiFactory,
} from '@backstage/core-plugin-api';
import type { Permission } from '@backstage/plugin-permission-common';

/** Context passed to optional Git Repos page tab renderers. */
export type GitRepositoriesPageTabContext = {
  repositoryDetailPath: (entityName: string, ruleId?: string) => string;
};

/** Optional top-level tab on the Git Repositories page (e.g. a custom analytics tab). */
export type GitRepositoriesPageTabDefinition = {
  /** Unique within `getPageTabs()`. Prefer `plugin.<name>.page-tab.<item>`. */
  id: string;
  label: string;
  path: string;
  /** Global: merged with Catalog (0) and CI Activity (20) and sorted together. */
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
  /** Unique within `getPageHeaderActions()`. Prefer `plugin.<name>.page-header.<item>`. */
  id: string;
  /** Local: ranks guest header actions among themselves only. */
  order: number;
  render: () => ReactNode;
};

/** Context for optional entity-detail tab extensions. */
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
  };

export type GitRepositoryDetailHeaderMenuItemDefinition = {
  /** Unique within `getDetailHeaderMenuItems()`. Prefer `plugin.<name>.detail-menu.<item>`. */
  id: string;
  /** Local: ranks guest Actions-menu items among themselves only. */
  order: number;
  render: (context: GitRepositoryDetailHeaderMenuContext) => ReactNode;
};

/**
 * Optional slot on the Overview tab sidebar, rendered above About
 * (e.g. a summary card).
 */
export type GitRepositoryDetailOverviewSlotDefinition = {
  /** Unique within `getDetailOverviewSlots()`. Prefer `plugin.<name>.overview-slot.<item>`. */
  id: string;
  /** Local: ranks guest Overview slots among themselves (host places them above About). */
  order: number;
  render: (context: GitRepositoryDetailTabContext) => ReactNode;
};

/** Optional tab on a git-repository entity detail page. */
export type GitRepositoryDetailTabDefinition = {
  /** Unique within `getDetailTabs()`. Prefer `plugin.<name>.detail-tab.<item>`. */
  id: string;
  label: string;
  /** Global: merged with Overview (0), CI Activity (20), Collections (30). */
  order: number;
  render: (context: GitRepositoryDetailTabContext) => ReactNode;
};

/** Optional catalog row addon (e.g. a status chip). */
export type GitRepositoryCatalogRowContext = {
  entity: Entity;
  projectDetailPath?: string;
};

export type GitRepositoryCatalogRowSlotDefinition = {
  /** Unique within `getCatalogRowSlots()`. Prefer `plugin.<name>.row-slot.<item>`. */
  id: string;
  /** Local: ranks guest row addons among themselves (host places them next to the name). */
  order: number;
  render: (context: GitRepositoryCatalogRowContext) => ReactNode;
};

/** Context for optional Actions kebab items on the Git Repositories list. */
export type GitRepositoryCatalogRowMenuContext = {
  entity: Entity;
  onCloseMenu: () => void;
};

export type GitRepositoryCatalogRowMenuItemDefinition = {
  /** Unique within `getCatalogRowMenuItems()`. Prefer `plugin.<name>.row-menu.<item>`. */
  id: string;
  /** Local: ranks guest kebab items among themselves (after View in source). */
  order: number;
  render: (context: GitRepositoryCatalogRowMenuContext) => ReactNode;
};

/** Optional table column contributed by a factory plugin (e.g. extra metrics). */
export type GitRepositoryCatalogColumnDefinition = {
  /** Unique within `getCatalogColumns()`. Prefer `plugin.<name>.column.<item>`. */
  id: string;
  title: string;
  tooltip?: string;
  /**
   * Local: ranks guest columns among themselves only. The host always inserts
   * that group between the core Contains and Last Activity columns — guests
   * cannot appear first, last, or elsewhere in the table.
   */
  order: number;
  render: (entity: Entity) => ReactNode;
};

/**
 * Persistent overlay on the repository detail page (outside the Actions Menu).
 * Use for dialogs that must survive menu close (e.g. remove confirmation).
 */
export type GitRepositoryDetailOverlayDefinition = {
  /** Unique within `getDetailOverlays()`. Prefer `plugin.<name>.overlay.<item>`. */
  id: string;
  /** Local: ranks guest overlays among themselves only. */
  order: number;
  render: (context: GitRepositoryDetailTabContext) => ReactNode;
};

/**
 * Host/guest extension contract for Git Repositories surfaces.
 *
 * @alpha Not independently versioned (`workspace:^` / private package).
 */
export interface GitRepositoriesExtensionsApi {
  getPageTabs(): GitRepositoriesPageTabDefinition[];
  getPageHeaderActions(): GitRepositoriesPageHeaderActionDefinition[];
  getDetailTabs(): GitRepositoryDetailTabDefinition[];
  getDetailOverviewSlots(): GitRepositoryDetailOverviewSlotDefinition[];
  getDetailHeaderMenuItems(): GitRepositoryDetailHeaderMenuItemDefinition[];
  getDetailOverlays(): GitRepositoryDetailOverlayDefinition[];
  getCollectionsTabContent(
    context: GitRepositoryDetailTabContext,
  ): ReactNode | null;
  getCatalogRowSlots(): GitRepositoryCatalogRowSlotDefinition[];
  getCatalogRowMenuItems(): GitRepositoryCatalogRowMenuItemDefinition[];
  getCatalogColumns(): GitRepositoryCatalogColumnDefinition[];
}

/**
 * Git Repositories host/guest extension contract.
 *
 * Backstage binds a single implementation per apiRef. The host registers an
 * empty default (ADR-010 zero footprint). A guest replaces it entirely — a
 * second guest cannot register in parallel without a composite factory.
 *
 * @alpha Not independently versioned (`workspace:^` / private package).
 */
export const gitRepositoriesExtensionsApiRef =
  createApiRef<GitRepositoriesExtensionsApi>({
    id: 'plugin.rhaap.git-repositories.extensions',
  });

/**
 * Empty default implementation (ADR-010 zero footprint).
 *
 * @alpha
 */
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

/**
 * Host default factory so Git Repos has a bound apiRef when no guest is loaded.
 * Guest plugins replace this from packages/app or Janus `apiFactories`.
 *
 * @alpha
 */
export const defaultGitRepositoriesExtensionsApiFactory: AnyApiFactory =
  createApiFactory({
    api: gitRepositoriesExtensionsApiRef,
    deps: {},
    factory: () => new DefaultGitRepositoriesExtensionsApi(),
  });
