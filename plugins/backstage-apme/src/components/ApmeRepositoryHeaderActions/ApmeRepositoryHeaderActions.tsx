/*
 * Copyright Red Hat
 *
 * ADR-010: Thin repository detail header actions (US-002).
 */

import { useCallback } from 'react';
import { ListItemIcon, ListItemText, MenuItem } from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import type { GitRepositoryDetailHeaderMenuContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { normalizeRepoUrlFromEntity } from '@ansible/backstage-rhaap-common/catalogEntity';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';
import { useNavigateToRepositoryQualityTab } from '../../hooks/useNavigateToRepositoryQualityTab';

export interface ApmeRepositoryHeaderActionsProps {
  context: GitRepositoryDetailHeaderMenuContext;
  onCloseMenu: () => void;
}

/** Menu items for repo detail / list Actions — Run quality scan only. */
export const ApmeRepositoryHeaderActions = ({
  context,
  onCloseMenu,
}: ApmeRepositoryHeaderActionsProps) => {
  const enabled = useApmeEnabled();
  const navigateToQualityTab = useNavigateToRepositoryQualityTab(
    context.entity,
  );

  const repoUrl = context.repoUrl ?? normalizeRepoUrlFromEntity(context.entity);

  const handleScan = useCallback(() => {
    onCloseMenu();
    // Open Quality with CheckOptionsForm — user chooses core/AI then Scan.
    navigateToQualityTab();
  }, [navigateToQualityTab, onCloseMenu]);

  if (!enabled || !repoUrl) {
    return null;
  }

  return (
    <MenuItem
      onClick={handleScan}
      style={{ justifyContent: 'space-between', gap: 16 }}
    >
      <ListItemText primary="Run quality scan" />
      <ListItemIcon style={{ minWidth: 0 }}>
        <PlayArrowIcon fontSize="small" style={{ opacity: 0.6 }} />
      </ListItemIcon>
    </MenuItem>
  );
};
