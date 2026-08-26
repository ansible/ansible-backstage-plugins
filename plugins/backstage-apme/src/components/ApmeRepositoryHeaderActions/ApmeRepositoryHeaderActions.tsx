/*
 * Copyright Red Hat
 *
 * ADR-010: Thin repository detail header actions (US-002).
 */

import { useCallback } from 'react';
import { MenuItem } from '@material-ui/core';
import AssessmentIcon from '@material-ui/icons/Assessment';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import type { GitRepositoryDetailHeaderMenuContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { normalizeRepoUrlFromEntity } from '@ansible/backstage-rhaap-common/catalogEntity';
import { gitRepositoriesDeletePermission } from '@ansible/backstage-rhaap-common/permissions';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';
import { useNavigateToRepositoryQualityTab } from '../../hooks/useNavigateToRepositoryQualityTab';
import { isManuallyRegisteredRepository } from '../../hooks/useDeregisterRepository';
import { deregisterRepositoryDialogStore } from '../ApmeDeregisterRepositoryOverlay';

export interface ApmeRepositoryHeaderActionsProps {
  context: GitRepositoryDetailHeaderMenuContext;
  onCloseMenu: () => void;
}

/** Menu items for repo detail / list Actions — Run quality scan + Deregister for manual repos. */
export const ApmeRepositoryHeaderActions = ({
  context,
  onCloseMenu,
}: ApmeRepositoryHeaderActionsProps) => {
  const enabled = useApmeEnabled();
  const config = useApi(configApiRef);
  const navigateToQualityTab = useNavigateToRepositoryQualityTab(
    context.entity,
  );

  const isPermissionFrameworkEnabled =
    config.getOptionalBoolean('permission.enabled');
  const { loading: deletePermissionLoading, allowed: canDeleteGitRepo } =
    usePermission({
      permission: gitRepositoriesDeletePermission,
    });

  const repoUrl = context.repoUrl ?? normalizeRepoUrlFromEntity(context.entity);
  const isManualRepo = isManuallyRegisteredRepository(context.entity);
  const canDeregister =
    isManualRepo &&
    (!isPermissionFrameworkEnabled ||
      (!deletePermissionLoading && canDeleteGitRepo));

  const handleScan = useCallback(() => {
    onCloseMenu();
    navigateToQualityTab();
  }, [navigateToQualityTab, onCloseMenu]);

  const handleDeregisterClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onCloseMenu();
      // Open after the Actions menu backdrop finishes closing; otherwise MUI
      // treats that backdrop click as a Dialog dismiss and the confirm flashes away.
      window.setTimeout(() => {
        deregisterRepositoryDialogStore.open(context.entity);
      }, 150);
    },
    [context.entity, onCloseMenu],
  );

  if (!enabled || !repoUrl) {
    return null;
  }

  return (
    <>
      <MenuItem onClick={handleScan}>
        <AssessmentIcon fontSize="small" style={{ marginRight: 8 }} />
        Run quality scan
      </MenuItem>
      {canDeregister && (
        <MenuItem onClick={handleDeregisterClick}>
          <DeleteOutlineIcon fontSize="small" style={{ marginRight: 8 }} />
          Deregister
        </MenuItem>
      )}
    </>
  );
};
