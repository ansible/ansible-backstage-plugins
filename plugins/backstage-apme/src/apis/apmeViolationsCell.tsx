/*
 * Copyright Red Hat
 *
 * Shared Violations catalog column cell + project map cache.
 * Used by both monolith (packages/app) and OCI/dynamic plugin extension factories.
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, CircularProgress, Typography, useTheme } from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';
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
import { useApmeColorTokens } from '../hooks/useApmeColorTokens';
import { projectHasActiveOperation } from '@ansible/backstage-apme-common/operationStatus';

// Shared across all cells in a single table render; the first cell to
// mount triggers the fetch, subsequent cells read from the same promise.
let projectsFetchPromise: Promise<Map<string, Project>> | null = null;

type ProjectMapListener = (map: Map<string, Project>) => void;
const projectMapListeners = new Set<ProjectMapListener>();
let sharedPollInterval: ReturnType<typeof setInterval> | null = null;
let activeFetchFn: (() => Promise<Map<string, Project>>) | null = null;

function notifyProjectMapListeners(map: Map<string, Project>): void {
  for (const listener of projectMapListeners) {
    listener(map);
  }
}

function stopSharedProjectMapPoller(): void {
  if (sharedPollInterval !== null) {
    clearInterval(sharedPollInterval);
    sharedPollInterval = null;
  }
}

function ensureSharedProjectMapPoller(
  map: Map<string, Project>,
  fetchProjectMap: () => Promise<Map<string, Project>>,
): void {
  activeFetchFn = fetchProjectMap;
  const hasActiveScan = [...map.values()].some(projectHasActiveOperation);
  if (!hasActiveScan) {
    stopSharedProjectMapPoller();
    return;
  }
  if (sharedPollInterval !== null) {
    return;
  }
  sharedPollInterval = setInterval(() => {
    if (!activeFetchFn) {
      return;
    }
    projectsFetchPromise = activeFetchFn().catch(
      () => new Map<string, Project>(),
    );
    void projectsFetchPromise.then(updatedMap => {
      notifyProjectMapListeners(updatedMap);
      if (![...updatedMap.values()].some(projectHasActiveOperation)) {
        stopSharedProjectMapPoller();
      }
    });
  }, 5000);
}

export function resetApmeProjectsFetchPromise(): void {
  projectsFetchPromise = null;
  stopSharedProjectMapPoller();
}

function buildProjectMap(projects: Project[]): Map<string, Project> {
  const map = new Map<string, Project>();
  for (const project of projects) {
    map.set(projectLookupKey(project.repo_url, project.branch), project);
  }
  return map;
}

export function ApmeViolationsCell({ entity }: { entity: Entity }) {
  const theme = useTheme();
  const colorTokens = useApmeColorTokens();
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
    const listener: ProjectMapListener = map => setProjectMap(map);
    projectMapListeners.add(listener);
    return () => {
      projectMapListeners.delete(listener);
      if (projectMapListeners.size === 0) {
        stopSharedProjectMapPoller();
      }
    };
  }, []);

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
    ensureSharedProjectMapPoller(projectMap, fetchProjectMap);
    return undefined;
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
  const worstTokens = colorTokens.severity[worstLevel];
  const severitySuffix =
    worstCount > 0
      ? ` (${worstCount} ${SEVERITY_STYLES[worstLevel].label.toUpperCase()})`
      : '';
  const entityName = entity.metadata?.name ?? '';
  const detailPath = `${window.location.pathname.replace(/\/catalog$/, '')}/${entityName}?tab=quality`;

  return (
    <Box>
      <Typography
        variant="body2"
        style={{ color: worstTokens.inlineText, fontWeight: 600 }}
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
