/*
 * Copyright Red Hat
 *
 * ADR-010: Thin repository detail header actions (US-002).
 */

import { useCallback } from 'react';
import { MenuItem } from '@material-ui/core';
import AssessmentIcon from '@material-ui/icons/Assessment';
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
    <MenuItem onClick={handleScan}>
      <AssessmentIcon fontSize="small" style={{ marginRight: 8 }} />
      Run quality scan
    </MenuItem>
  );
};
