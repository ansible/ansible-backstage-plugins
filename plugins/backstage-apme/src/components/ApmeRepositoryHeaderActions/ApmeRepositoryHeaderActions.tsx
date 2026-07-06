/*
 * Copyright Red Hat
 *
 * ADR-010: Repository detail header actions composed from packages/app.
 */

import { useCallback, useState } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tooltip,
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import SyncIcon from '@material-ui/icons/Sync';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import type { GitRepositoryDetailTabContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { buildDevSpacesUrlFromRepoUrl } from '@ansible/backstage-rhaap-common/devSpaces';
import { apmeApiRef } from '../../api';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';
import {
  normalizeRepoUrlFromEntity,
  defaultBranchFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';

export interface ApmeRepositoryHeaderActionsProps {
  context: GitRepositoryDetailTabContext;
  onCloseMenu: () => void;
}

/** Menu items for repo detail Actions dropdown (scan, Dev Spaces). */
export const ApmeRepositoryHeaderActions = ({
  context,
  onCloseMenu,
}: ApmeRepositoryHeaderActionsProps) => {
  const apmeApi = useApi(apmeApiRef);
  const enabled = useApmeEnabled();
  const [scanning, setScanning] = useState(false);
  const repoUrl = context.repoUrl ?? normalizeRepoUrlFromEntity(context.entity);
  const branch = defaultBranchFromEntity(context.entity);
  const devSpacesUrl = repoUrl
    ? buildDevSpacesUrlFromRepoUrl(repoUrl, branch)
    : null;

  const { value: project } = useAsync(async () => {
    if (!enabled || !repoUrl) return null;
    return apmeApi.getProjectByRepoUrl(repoUrl, branch);
  }, [enabled, apmeApi, repoUrl, branch]);

  const handleScan = useCallback(async () => {
    if (!project?.id) return;
    onCloseMenu();
    setScanning(true);
    try {
      await apmeApi.triggerScan(project.id);
    } finally {
      setScanning(false);
    }
  }, [apmeApi, onCloseMenu, project?.id]);

  const handleDevSpaces = useCallback(() => {
    onCloseMenu();
    if (devSpacesUrl) {
      window.open(devSpacesUrl, '_blank', 'noopener,noreferrer');
    }
  }, [devSpacesUrl, onCloseMenu]);

  if (!enabled || !repoUrl) {
    return null;
  }

  return (
    <>
      <Tooltip title="Repository sync is managed by the discovery source">
        <span>
          <MenuItem
            disabled
            style={{ justifyContent: 'space-between', gap: 16 }}
          >
            <ListItemText primary="Sync with source" />
            <ListItemIcon style={{ minWidth: 0 }}>
              <SyncIcon fontSize="small" style={{ opacity: 0.6 }} />
            </ListItemIcon>
          </MenuItem>
        </span>
      </Tooltip>
      <MenuItem
        onClick={() => void handleScan()}
        disabled={!project?.id || scanning}
        style={{ justifyContent: 'space-between', gap: 16 }}
      >
        <ListItemText
          primary={scanning ? 'Starting scan…' : 'Run quality scan'}
        />
        <ListItemIcon style={{ minWidth: 0 }}>
          <PlayArrowIcon fontSize="small" style={{ opacity: 0.6 }} />
        </ListItemIcon>
      </MenuItem>
      {devSpacesUrl && (
        <MenuItem
          onClick={handleDevSpaces}
          style={{ justifyContent: 'space-between', gap: 16 }}
        >
          <ListItemText primary="Edit in Dev Spaces" />
          <ListItemIcon style={{ minWidth: 0 }}>
            <OpenInNewIcon fontSize="small" style={{ opacity: 0.6 }} />
          </ListItemIcon>
        </MenuItem>
      )}
    </>
  );
};
