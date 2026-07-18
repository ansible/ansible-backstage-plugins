/*
 * Copyright Red Hat
 *
 * Shared Git Repositories extension API for monolith (lazy) and OCI (direct) wiring.
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
  type GitRepositoryDetailTabContext,
  type GitRepositoryDetailHeaderMenuContext,
  type GitRepositoriesPageTabContext,
  type GitRepositoryCatalogColumnDefinition,
} from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { ApmeAddRepositoryHeaderAction } from '../components/ApmeAddRepositoryHeaderAction/ApmeAddRepositoryHeaderAction';

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
  ApmeQualitySettingsTab: ComponentType;
  EntityQualityTab: ComponentType<{
    entity: GitRepositoryDetailTabContext['entity'];
    initialRuleFilter?: string;
    initialCategoryFilter?: string;
  }>;
  DependenciesTab: ComponentType<{ context: GitRepositoryDetailTabContext }>;
  ApmeRepositoryOverviewCard: ComponentType<{
    context: GitRepositoryDetailTabContext;
  }>;
  ApmeRepositoryCollectionsTab: ComponentType<{
    context: GitRepositoryDetailTabContext;
  }>;
  ApmeRepositoryHeaderActions: ComponentType<{
    context: GitRepositoryDetailHeaderMenuContext;
    onCloseMenu: () => void;
  }>;
  ApmeRemoveRepositoryDialog: ComponentType<{
    context: GitRepositoryDetailTabContext;
  }>;
  ApmeViolationsCell: ComponentType<{ entity: Entity }>;
};

export function createApmeGitRepositoriesExtensionsApi(
  components: ApmeGitRepositoriesComponents,
): new () => GitRepositoriesExtensionsApi {
  const {
    FleetQualityTab,
    ApmeQualitySettingsTab,
    EntityQualityTab,
    DependenciesTab,
    ApmeRepositoryOverviewCard,
    ApmeRepositoryCollectionsTab,
    ApmeRepositoryHeaderActions,
    ApmeRemoveRepositoryDialog,
    ApmeViolationsCell,
  } = components;

  return class ApmeGitRepositoriesExtensionsApi
    extends DefaultGitRepositoriesExtensionsApi
    implements GitRepositoriesExtensionsApi
  {
    getPageTabs() {
      return [
        {
          id: 'quality',
          label: 'Quality',
          path: 'quality',
          order: 10,
          render: ({ repositoryDetailPath }: GitRepositoriesPageTabContext) => (
            <FleetQualityTab repositoryDetailPath={repositoryDetailPath} />
          ),
        },
        {
          id: 'quality-settings',
          label: 'Quality settings',
          path: 'quality-settings',
          order: 30,
          render: () => <ApmeQualitySettingsTab />,
        },
      ];
    }

    getPageHeaderActions() {
      return [
        {
          id: 'add-repository',
          order: 10,
          render: () => <ApmeAddRepositoryHeaderAction />,
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
          id: 'dependencies',
          label: 'Dependencies',
          order: 15,
          render: (ctx: GitRepositoryDetailTabContext) => (
            <DependenciesTab context={ctx} />
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

    getDetailOverlays() {
      return [
        {
          id: 'apme-remove-repository-dialog',
          order: 10,
          render: (ctx: GitRepositoryDetailTabContext) => (
            <ApmeRemoveRepositoryDialog context={ctx} />
          ),
        },
      ];
    }

    getCollectionsTabContent(context: GitRepositoryDetailTabContext) {
      return <ApmeRepositoryCollectionsTab context={context} />;
    }

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
