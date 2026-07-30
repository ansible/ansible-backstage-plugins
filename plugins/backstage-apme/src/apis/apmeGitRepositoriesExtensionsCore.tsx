/*
 * Copyright Red Hat
 *
 * Shared Git Repositories extension API for monolith (lazy) and OCI (direct) wiring.
 * eap-next thin host: Quality detail tab, Run quality scan, status chrome only.
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
  type GitRepositoryCatalogColumnDefinition,
  type GitRepositoryCatalogRowContext,
  type GitRepositoryCatalogRowMenuContext,
} from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import {
  defaultBranchFromEntity,
  normalizeRepoUrlFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';
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
  EntityQualityTab: ComponentType<{
    entity: GitRepositoryDetailTabContext['entity'];
    initialRuleFilter?: string;
    initialCategoryFilter?: string;
  }>;
  ApmeRepositoryHeaderActions: ComponentType<{
    context: GitRepositoryDetailHeaderMenuContext;
    onCloseMenu: () => void;
  }>;
  ApmeRepoStatusChip: ComponentType<{
    repoUrl: string;
    branch?: string;
    projectDetailPath?: string;
  }>;
  ApmeViolationsCell: ComponentType<{ entity: Entity }>;
};

export function createApmeGitRepositoriesExtensionsApi(
  components: ApmeGitRepositoriesComponents,
): new () => GitRepositoriesExtensionsApi {
  const {
    EntityQualityTab,
    ApmeRepositoryHeaderActions,
    ApmeRepoStatusChip,
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

    getCatalogRowSlots() {
      return [
        {
          id: 'apme-status-chip',
          order: 10,
          render: ({
            entity,
            projectDetailPath,
          }: GitRepositoryCatalogRowContext) => {
            const repoUrl = normalizeRepoUrlFromEntity(entity);
            if (!repoUrl) {
              return null;
            }
            return (
              <ApmeRepoStatusChip
                repoUrl={repoUrl}
                branch={defaultBranchFromEntity(entity)}
                projectDetailPath={projectDetailPath}
              />
            );
          },
        },
      ];
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
