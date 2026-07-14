/*
 * Copyright Red Hat
 *
 * ADR-010: Composition root registers optional factory plugin UI for Git Repos surfaces.
 */

import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { Box, CircularProgress, Typography, useTheme } from '@material-ui/core';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
  useApi,
} from '@backstage/core-plugin-api';
import { Config } from '@backstage/config';
import { Entity } from '@backstage/catalog-model';
import {
  DefaultGitRepositoriesExtensionsApi,
  gitRepositoriesExtensionsApiRef,
  type GitRepositoriesExtensionsApi,
  type GitRepositoryDetailTabContext,
  type GitRepositoryDetailHeaderMenuContext,
  type GitRepositoriesPageTabContext,
  type GitRepositoryCatalogColumnDefinition,
} from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import {
  normalizeRepoUrlFromEntity,
  defaultBranchFromEntity,
  projectLookupKey,
} from '@ansible/backstage-rhaap-common/catalogEntity';
import type { Project } from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '@ansible/backstage-apme-common/api';
import {
  SEVERITY_STYLES,
  getWorstViolationLevel,
  resolveViolationCounts,
} from '@ansible/backstage-apme-common/severity';
import { projectHasActiveOperation } from '@ansible/backstage-apme-common/operationStatus';

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

function isApmeEnabled(config: Config): boolean {
  return config.getOptionalBoolean('ansible.apme.enabled') ?? false;
}

// ── Violations column cell ──────────────────────────────────────────────
// Shared across all cells in a single table render; the first cell to
// mount triggers the fetch, subsequent cells read from the same promise.
let projectsFetchPromise: Promise<Map<string, Project>> | null = null;

function buildProjectMap(projects: Project[]): Map<string, Project> {
  const map = new Map<string, Project>();
  for (const project of projects) {
    map.set(projectLookupKey(project.repo_url, project.branch), project);
  }
  return map;
}

function ApmeViolationsCell({ entity }: { entity: Entity }) {
  const theme = useTheme();
  const apmeApi = useApi(apmeApiRef);
  const mutedStatusStyle = {
    fontWeight: 500,
    color: theme.palette.text.primary,
  };
  const [projectMap, setProjectMap] = useState<Map<string, Project> | null>(
    null,
  );

  const fetchProjectMap = useCallback(async () => {
    const projects = await apmeApi.getProjects();
    return buildProjectMap(projects);
  }, [apmeApi]);

  useEffect(() => {
    let cancelled = false;
    if (!projectsFetchPromise) {
      projectsFetchPromise = fetchProjectMap().catch(
        () => new Map<string, Project>(),
      );
    }
    projectsFetchPromise.then(map => {
      if (!cancelled) {
        setProjectMap(map);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchProjectMap]);

  useEffect(() => {
    if (!projectMap) {
      return undefined;
    }
    const hasActiveScan = [...projectMap.values()].some(
      projectHasActiveOperation,
    );
    if (!hasActiveScan) {
      return undefined;
    }

    const interval = setInterval(() => {
      projectsFetchPromise = fetchProjectMap().catch(
        () => new Map<string, Project>(),
      );
      void projectsFetchPromise.then(map => setProjectMap(map));
    }, 5000);

    return () => clearInterval(interval);
  }, [projectMap, fetchProjectMap]);

  if (!projectMap) {
    return null;
  }

  const repoUrl = normalizeRepoUrlFromEntity(entity);
  const branch = defaultBranchFromEntity(entity);
  const project = repoUrl
    ? projectMap.get(projectLookupKey(repoUrl, branch))
    : undefined;

  if (!project) {
    return (
      <Typography variant="body2" style={mutedStatusStyle}>
        Not scanned
      </Typography>
    );
  }

  if (projectHasActiveOperation(project)) {
    return (
      <Box display="flex" alignItems="center" gridGap={6}>
        <CircularProgress size={14} />
        <Typography
          variant="body2"
          style={{ color: '#1976d2', fontWeight: 500 }}
        >
          Scanning…
        </Typography>
      </Box>
    );
  }

  const neverScanned =
    (project.scan_count ?? 0) === 0 && !project.last_scanned_at;

  if (neverScanned) {
    return (
      <Typography variant="body2" style={mutedStatusStyle}>
        Not scanned
      </Typography>
    );
  }

  if (project.total_violations === 0) {
    return (
      <Typography variant="body2" style={{ color: '#4caf50', fontWeight: 500 }}>
        ✓ No violations
      </Typography>
    );
  }

  const counts = resolveViolationCounts(project);
  const { level: worstLevel, count: worstCount } =
    getWorstViolationLevel(counts);
  const sev = worstLevel;
  const style = SEVERITY_STYLES[sev];
  const severitySuffix =
    worstCount > 0
      ? ` (${worstCount} ${SEVERITY_STYLES[sev].label.toUpperCase()})`
      : '';
  const entityName = entity.metadata?.name ?? '';
  const detailPath = `${window.location.pathname.replace(/\/catalog$/, '')}/${entityName}?tab=quality`;

  return (
    <Box>
      <Typography
        variant="body2"
        style={{ color: style.background, fontWeight: 600 }}
      >
        {project.total_violations}
        {severitySuffix}
      </Typography>
      <Typography
        variant="caption"
        component="div"
        style={{
          color: '#0066cc',
          cursor: 'pointer',
          textDecoration: 'none',
        }}
        onClick={() => {
          window.location.href = detailPath;
        }}
      >
        Fix violations →
      </Typography>
    </Box>
  );
}

// ── Extension API implementation ────────────────────────────────────────

class ApmeGitRepositoriesExtensionsApi
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
          <Suspense fallback={null}>
            <LazyApmeFleetQualityTab
              repositoryDetailPath={repositoryDetailPath}
            />
          </Suspense>
        ),
      },
      {
        id: 'quality-settings',
        label: 'Quality settings',
        path: 'quality-settings',
        order: 30,
        render: () => (
          <Suspense fallback={null}>
            <LazyApmeQualitySettingsTab />
          </Suspense>
        ),
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
          <Suspense fallback={null}>
            <LazyEntityQualityTab
              entity={entity}
              initialRuleFilter={initialRuleFilter}
              initialCategoryFilter={initialCategoryFilter}
            />
          </Suspense>
        ),
      },
      {
        id: 'dependencies',
        label: 'Dependencies',
        order: 15,
        render: (ctx: GitRepositoryDetailTabContext) => (
          <Suspense fallback={null}>
            <LazyDependenciesTab context={ctx} />
          </Suspense>
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
          <Suspense fallback={null}>
            <LazyApmeRepositoryOverviewCard context={ctx} />
          </Suspense>
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
          <Suspense fallback={null}>
            <LazyApmeRepositoryHeaderActions
              context={ctx}
              onCloseMenu={ctx.onCloseMenu}
            />
          </Suspense>
        ),
      },
    ];
  }

  getCollectionsTabContent(context: GitRepositoryDetailTabContext) {
    return (
      <Suspense fallback={null}>
        <LazyApmeRepositoryCollectionsTab context={context} />
      </Suspense>
    );
  }

  getCatalogRowSlots() {
    return [];
  }

  getCatalogColumns(): GitRepositoryCatalogColumnDefinition[] {
    // Reset the shared cache so each table mount gets fresh data
    projectsFetchPromise = null;
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
}

export const gitRepositoriesExtensionsApiFactory: AnyApiFactory =
  createApiFactory({
    api: gitRepositoriesExtensionsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) =>
      isApmeEnabled(configApi)
        ? new ApmeGitRepositoriesExtensionsApi()
        : new DefaultGitRepositoriesExtensionsApi(),
  });
