/*
 * Copyright Red Hat
 *
 * Shared Git Repositories extension API for monolith (lazy) and OCI (direct) wiring.
 * eap-next thin host: Quality + Quality activity detail tabs, Fleet Quality +
 * settings page tabs, Overview quality card, Run quality scan, status chrome.
 */

import { Suspense, type ComponentType } from 'react';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
} from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { isApmeEnabled } from '@ansible/backstage-apme-common/config';
import {
  DefaultGitRepositoriesExtensionsApi,
  gitRepositoriesExtensionsApiRef,
  type GitRepositoriesExtensionsApi,
  type GitRepositoriesPageTabContext,
  type GitRepositoryDetailTabContext,
  type GitRepositoryDetailHeaderMenuContext,
  type GitRepositoryCatalogColumnDefinition,
  type GitRepositoryCatalogRowMenuContext,
} from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { normalizeRepoUrlFromEntity } from '@ansible/backstage-rhaap-common/catalogEntity';
import { ApmeAddRepositoryHeaderAction } from '../components/ApmeAddRepositoryHeaderAction/ApmeAddRepositoryHeaderAction';
import { ApmeQualitySettingsTab } from '../components/ApmeQualitySettingsTab';

export function withSuspense<P extends object>(
  Component: ComponentType<P>,
): ComponentType<P> {
  return function SuspenseWrapped(props: P) {
    return (
      <Suspense fallback={null}>
        <Component {...props} />
      </Suspense>
    );
  };
}

export type ApmeGitRepositoriesComponents = {
  FleetQualityTab: ComponentType<{
    repositoryDetailPath: GitRepositoriesPageTabContext['repositoryDetailPath'];
  }>;
  EntityQualityTab: ComponentType<{
    entity: GitRepositoryDetailTabContext['entity'];
    initialRuleFilter?: string;
    initialCategoryFilter?: string;
  }>;
  EntityQualityActivityTab: ComponentType<{
    entity: GitRepositoryDetailTabContext['entity'];
  }>;
  ApmeRepositoryOverviewCard: ComponentType<{
    context: GitRepositoryDetailTabContext;
  }>;
  ApmeRepositoryHeaderActions: ComponentType<{
    context: GitRepositoryDetailHeaderMenuContext;
    onCloseMenu: () => void;
  }>;
  ApmeViolationsCell: ComponentType<{ entity: Entity }>;
};

export function createApmeGitRepositoriesExtensionsApi(
  components: ApmeGitRepositoriesComponents,
): new () => GitRepositoriesExtensionsApi {
  const {
    FleetQualityTab,
    EntityQualityTab,
    EntityQualityActivityTab,
    ApmeRepositoryOverviewCard,
    ApmeRepositoryHeaderActions,
    ApmeViolationsCell,
  } = components;

  return class ApmeGitRepositoriesExtensionsApi
    extends DefaultGitRepositoriesExtensionsApi
    implements GitRepositoriesExtensionsApi
  {
    getPageHeaderActions() {
      return [
        {
          id: 'add-repository',
          order: 10,
          render: () => <ApmeAddRepositoryHeaderAction />,
        },
      ];
    }

    getPageTabs() {
      return [
        {
          id: 'quality',
          label: 'Quality',
          path: 'quality',
          order: 10,
          render: ({
            repositoryDetailPath,
          }: GitRepositoriesPageTabContext) => (
            <FleetQualityTab repositoryDetailPath={repositoryDetailPath} />
          ),
        },
        {
          id: 'quality-settings',
          label: 'Quality settings',
          path: 'quality-settings',
          order: 15,
          render: () => <ApmeQualitySettingsTab />,
        },
      ];
    }

    getDetailTabs() {
      return [
        {
          id: 'quality',
          label: 'Quality',
          order: 10,
          render: ({
            entity,
            initialRuleFilter,
            initialCategoryFilter,
          }: GitRepositoryDetailTabContext) => (
            <EntityQualityTab
              entity={entity}
              initialRuleFilter={initialRuleFilter}
              initialCategoryFilter={initialCategoryFilter}
            />
          ),
        },
        {
          id: 'quality-activity',
          label: 'Quality activity',
          order: 15,
          render: ({ entity }: GitRepositoryDetailTabContext) => (
            <EntityQualityActivityTab entity={entity} />
          ),
        },
      ];
    }

    getDetailOverviewSlots() {
      return [
        {
          id: 'apme-quality-overview',
          order: 10,
          render: (ctx: GitRepositoryDetailTabContext) => (
            <ApmeRepositoryOverviewCard context={ctx} />
          ),
        },
      ];
    }

    getDetailHeaderMenuItems() {
      return [
        {
          id: 'apme-header-actions',
          order: 10,
          render: (ctx: GitRepositoryDetailHeaderMenuContext) => (
            <ApmeRepositoryHeaderActions
              context={ctx}
              onCloseMenu={ctx.onCloseMenu}
            />
          ),
        },
      ];
    }

    getCatalogRowMenuItems() {
      return [
        {
          id: 'apme-run-quality-scan',
          order: 10,
          render: (ctx: GitRepositoryCatalogRowMenuContext) => (
            <ApmeRepositoryHeaderActions
              context={{
                entity: ctx.entity,
                repoUrl: normalizeRepoUrlFromEntity(ctx.entity),
                onCloseMenu: ctx.onCloseMenu,
              }}
              onCloseMenu={ctx.onCloseMenu}
            />
          ),
        },
      ];
    }

    /** Parity with prototype: no status chips on the catalog list (noisy). */
    getCatalogRowSlots() {
      return [];
    }

    getCatalogColumns(): GitRepositoryCatalogColumnDefinition[] {
      return [
        {
          id: 'violations',
          title: 'Violations',
          tooltip:
            'Content quality violations detected by APME scanning. Shows open violation count and highest severity.',
          order: 10,
          render: (entity: Entity) => <ApmeViolationsCell entity={entity} />,
        },
      ];
    }
  };
}

export function createGitRepositoriesExtensionsApiFactory(
  ApiClass: new () => GitRepositoriesExtensionsApi,
): AnyApiFactory {
  return createApiFactory({
    api: gitRepositoriesExtensionsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) =>
      isApmeEnabled(configApi)
        ? new ApiClass()
        : new DefaultGitRepositoriesExtensionsApi(),
  });
}
