/*
 * Copyright Red Hat
 *
 * ADR-010: Repository detail header actions composed from packages/app.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  configApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tooltip,
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import SyncIcon from '@material-ui/icons/Sync';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import SettingsIcon from '@material-ui/icons/Settings';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import type { GitRepositoryDetailHeaderMenuContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { buildDevSpacesUrlFromRepoUrl } from '@ansible/backstage-rhaap-common/devSpaces';
import {
  normalizeRepoUrlFromEntity,
  defaultBranchFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';
import { useNavigateToRepositoryQualityTab } from '../../hooks/useNavigateToRepositoryQualityTab';
import { isManuallyRegisteredGitRepository } from '../../utils/removeManualGitRepository';
import { requestRemoveRepository } from '../../utils/removeRepositoryDialogController';

export interface ApmeRepositoryHeaderActionsProps {
  context: GitRepositoryDetailHeaderMenuContext;
  onCloseMenu: () => void;
}

/** Menu items for repo detail Actions dropdown (scan, Dev Spaces, remove). */
export const ApmeRepositoryHeaderActions = ({
  context,
  onCloseMenu,
}: ApmeRepositoryHeaderActionsProps) => {
  const enabled = useApmeEnabled();
  const configApi = useApi(configApiRef);
  const navigate = useNavigate();
  const navigateToQualityTab = useNavigateToRepositoryQualityTab(context.entity);

  const repoUrl = context.repoUrl ?? normalizeRepoUrlFromEntity(context.entity);
  const branch = defaultBranchFromEntity(context.entity);
  const devSpacesBaseUrl = configApi.getOptionalString(
    'ansible.devSpaces.baseUrl',
  );
  const devSpacesUrl =
    devSpacesBaseUrl && repoUrl
      ? buildDevSpacesUrlFromRepoUrl(devSpacesBaseUrl, repoUrl, branch)
      : null;
  const isManual = isManuallyRegisteredGitRepository(context.entity);

  const handleScan = useCallback(() => {
    onCloseMenu();
    navigateToQualityTab(undefined, { triggerScan: true });
  }, [navigateToQualityTab, onCloseMenu]);

  const handleDevSpaces = useCallback(() => {
    onCloseMenu();
    if (devSpacesUrl) {
      window.open(devSpacesUrl, '_blank', 'noopener,noreferrer');
    }
  }, [devSpacesUrl, onCloseMenu]);

  const handleQualitySettings = useCallback(() => {
    onCloseMenu();
    navigate('/self-service/repositories/quality-settings');
  }, [navigate, onCloseMenu]);

  const handleOpenRemoveDialog = useCallback(() => {
    requestRemoveRepository(context.entity);
    onCloseMenu();
  }, [context.entity, onCloseMenu]);

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
        onClick={handleScan}
        style={{ justifyContent: 'space-between', gap: 16 }}
      >
        <ListItemText primary="Run quality scan" />
        <ListItemIcon style={{ minWidth: 0 }}>
          <PlayArrowIcon fontSize="small" style={{ opacity: 0.6 }} />
        </ListItemIcon>
      </MenuItem>
      <MenuItem
        onClick={handleQualitySettings}
        style={{ justifyContent: 'space-between', gap: 16 }}
      >
        <ListItemText primary="Quality settings" />
        <ListItemIcon style={{ minWidth: 0 }}>
          <SettingsIcon fontSize="small" style={{ opacity: 0.6 }} />
        </ListItemIcon>
      </MenuItem>
      {devSpacesBaseUrl && devSpacesUrl && (
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
      {isManual && (
        <MenuItem
          onClick={handleOpenRemoveDialog}
          style={{ justifyContent: 'space-between', gap: 16 }}
        >
          <ListItemText primary="Remove repository" />
          <ListItemIcon style={{ minWidth: 0 }}>
            <DeleteOutlineIcon fontSize="small" style={{ opacity: 0.6 }} />
          </ListItemIcon>
        </MenuItem>
      )}
    </>
  );
};
