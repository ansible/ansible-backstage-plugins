/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useState } from 'react';
import { useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Chip, CircularProgress, makeStyles } from '@material-ui/core';
import { useNavigate } from 'react-router-dom';
import { Project } from '@ansible/backstage-apme-common/types';
import {
  projectHasActiveOperation,
  shouldResumeScanUi,
} from '@ansible/backstage-apme-common/operationStatus';
import { apmeApiRef } from '../../api';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';

const useStyles = makeStyles(theme => ({
  clean: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.common.white,
  },
  scanning: {
    backgroundColor: theme.palette.info.main,
    color: theme.palette.common.white,
  },
  violations: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  notScanned: {
    backgroundColor: theme.palette.grey[400],
    color: theme.palette.common.white,
  },
}));

function getHighestSeverity(
  counts: NonNullable<Project['violationCounts']> | undefined,
): string {
  if (counts?.critical) return 'critical';
  if (counts?.error) return 'error';
  if (counts?.high) return 'high';
  if (counts?.medium) return 'medium';
  if (counts?.low) return 'low';
  return 'info';
}

export interface ApmeRepoStatusChipProps {
  repoUrl: string;
  branch?: string;
  projectDetailPath?: string;
}

/** Violation status chip for Git Repository cards. */
export const ApmeRepoStatusChip = ({
  repoUrl,
  branch,
  projectDetailPath,
}: ApmeRepoStatusChipProps) => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const navigate = useNavigate();
  const enabled = useApmeEnabled();
  const [operationActive, setOperationActive] = useState(false);

  const {
    value: project,
    loading,
    retry,
  } = useAsyncRetry(async () => {
    if (!enabled || !repoUrl) return null;
    return apmeApi.getProjectByRepoUrl(repoUrl, branch);
  }, [enabled, repoUrl, branch, apmeApi]);

  // Poll so Scanning… / violation counts update without a hard refresh.
  useEffect(() => {
    if (!enabled || !project?.id) {
      setOperationActive(false);
      return undefined;
    }

    const projectId = project.id;
    let cancelled = false;
    const tick = async () => {
      try {
        const [fresh, state] = await Promise.all([
          apmeApi.getProjectByRepoUrl(repoUrl, branch),
          apmeApi.getOperationState(projectId),
        ]);
        if (cancelled) return;
        const active =
          shouldResumeScanUi(state) || projectHasActiveOperation(fresh);
        setOperationActive(active);
        retry();
      } catch {
        // Next tick retries.
      }
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, project?.id, repoUrl, branch, apmeApi, retry]);

  if (!enabled) {
    return null;
  }

  if (loading && !project) {
    return <CircularProgress size={16} />;
  }

  if (!project) {
    return (
      <Chip size="small" label="Not scanned" className={classes.notScanned} />
    );
  }

  if (operationActive || projectHasActiveOperation(project)) {
    return <Chip size="small" label="Scanning…" className={classes.scanning} />;
  }

  if (project.total_violations === 0) {
    return <Chip size="small" label="Clean" className={classes.clean} />;
  }

  const highest = getHighestSeverity(project.violationCounts);

  const label = `${project.total_violations} ${highest}`;

  const handleClick = () => {
    if (projectDetailPath) {
      navigate(projectDetailPath);
      return;
    }
    const slug = project.name || project.id;
    navigate(`/self-service/repositories/${slug}?tab=quality`);
  };

  return (
    <Chip
      size="small"
      label={label}
      className={classes.violations}
      onClick={handleClick}
      clickable
    />
  );
};
