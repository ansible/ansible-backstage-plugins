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
  inlineTextColorForSeverity,
  projectWorstSeverity,
  worstSeverityCountSuffix,
} from '@ansible/backstage-apme-common/severity';
import { projectHasActiveOperation } from '@ansible/backstage-apme-common/operationStatus';
import type { GitRepositoryDetailTabContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { apmeApiRef } from '../../api';

/** Quality detail tab label — count tinted by worst open severity. */
export function ApmeQualityTabLabel({
  context,
}: {
  context: GitRepositoryDetailTabContext;
}) {
  const theme = useTheme();
  const apmeApi = useApi(apmeApiRef);
  const [project, setProject] = useState<Project | null>(null);
  const mode = theme.palette.type === 'dark' ? 'dark' : 'light';

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
  const color = worst
    ? inlineTextColorForSeverity(worst.level, mode)
    : theme.palette.text.secondary;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span>Quality</span>
      <span style={{ color, fontWeight: 600 }}>
        {project.total_violations}
        {worstSeverityCountSuffix(worst)}
      </span>
    </span>
  );
}
