/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useEffect, useState } from 'react';
import { useTheme } from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import { defaultBranchFromEntity } from '@ansible/backstage-rhaap-common/catalogEntity';
import type { Project } from '@ansible/backstage-apme-common/types';
import {
  chipStyleForSeverity,
  projectWorstSeverity,
  type SeverityLevel,
} from '@ansible/backstage-apme-common/severity';
import { projectHasActiveOperation } from '@ansible/backstage-apme-common/operationStatus';
import type { GitRepositoryDetailTabContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { apmeApiRef } from '../../api';

/**
 * Severity levels that warrant a colored pill on the tab label.
 * Low and informational render in default/neutral style per AC.
 */
const HIGHLIGHTED_LEVELS: ReadonlySet<SeverityLevel> = new Set<SeverityLevel>([
  'critical',
  'error',
  'high',
  'medium',
]);

/** Quality detail tab label — severity-colored pill badge reflecting worst open severity. */
export function ApmeQualityTabLabel({
  context,
}: {
  context: GitRepositoryDetailTabContext;
}) {
  const theme = useTheme();
  const apmeApi = useApi(apmeApiRef);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!context.repoUrl) {
      setProject(null);
      return undefined;
    }
    let cancelled = false;
    const branch = defaultBranchFromEntity(context.entity);
    void apmeApi
      .getProjectByRepoUrl(context.repoUrl, branch)
      .then(next => {
        if (!cancelled) {
          setProject(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProject(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apmeApi, context.entity, context.repoUrl]);

  if (!project || (project.total_violations ?? 0) === 0) {
    return <>Quality</>;
  }

  if (projectHasActiveOperation(project)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>Quality</span>
        <span style={{ color: theme.palette.info.main, fontWeight: 600 }}>
          Scanning…
        </span>
      </span>
    );
  }

  const worst = projectWorstSeverity(project);

  const showPill = worst !== null && HIGHLIGHTED_LEVELS.has(worst.level);

  if (!showPill) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>Quality</span>
        <span
          style={{
            color: theme.palette.text.secondary,
            fontWeight: 600,
          }}
        >
          {project.total_violations}
        </span>
      </span>
    );
  }

  const pillStyle = chipStyleForSeverity(worst.level);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>Quality</span>
      <span
        style={{
          ...pillStyle,
          display: 'inline-block',
          padding: '1px 7px',
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: '16px',
        }}
      >
        {project.total_violations}
      </span>
    </span>
  );
}
