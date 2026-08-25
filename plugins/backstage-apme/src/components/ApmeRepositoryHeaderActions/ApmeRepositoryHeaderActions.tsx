/*
 * Copyright Red Hat
 *
 * ADR-010: Thin repository detail header actions (US-002).
 */

import { useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MenuItem } from '@material-ui/core';
import AssessmentIcon from '@material-ui/icons/Assessment';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import type { GitRepositoryDetailHeaderMenuContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { normalizeRepoUrlFromEntity } from '@ansible/backstage-rhaap-common/catalogEntity';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';
import { useNavigateToRepositoryQualityTab } from '../../hooks/useNavigateToRepositoryQualityTab';
import { isManuallyRegisteredRepository } from '../../hooks/useDeregisterRepository';
import { DeregisterRepositoryDialog } from '../DeregisterRepositoryDialog';

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
  const navigate = useNavigate();
  const location = useLocation();
  const navigateToQualityTab = useNavigateToRepositoryQualityTab(
    context.entity,
  );
  const [deregisterDialogOpen, setDeregisterDialogOpen] = useState(false);

  const repoUrl = context.repoUrl ?? normalizeRepoUrlFromEntity(context.entity);
  const isManualRepo = isManuallyRegisteredRepository(context.entity);

  const handleScan = useCallback(() => {
    onCloseMenu();
    navigateToQualityTab();
  }, [navigateToQualityTab, onCloseMenu]);

  const handleDeregisterClick = useCallback(() => {
    onCloseMenu();
    setDeregisterDialogOpen(true);
  }, [onCloseMenu]);

  const handleDeregisterConfirm = useCallback(() => {
    setDeregisterDialogOpen(false);
    // Navigate to repositories catalog - derive path from current location
    // Current URL: /self-service/repositories/:repositoryName
    // Target URL: /self-service/repositories/catalog
    const currentPath = location.pathname;
    const repositoriesBase = currentPath.replace(/\/[^/]+$/, '');
    navigate(`${repositoriesBase}/catalog`);
  }, [navigate, location.pathname]);

  const handleDeregisterClose = useCallback(() => {
    setDeregisterDialogOpen(false);
  }, []);

  if (!enabled || !repoUrl) {
    return null;
  }

  return (
    <>
      <MenuItem onClick={handleScan}>
        <AssessmentIcon fontSize="small" style={{ marginRight: 8 }} />
        Run quality scan
      </MenuItem>
      {isManualRepo && (
        <MenuItem onClick={handleDeregisterClick}>
          <DeleteOutlineIcon fontSize="small" style={{ marginRight: 8 }} />
          Deregister
        </MenuItem>
      )}
      <DeregisterRepositoryDialog
        open={deregisterDialogOpen}
        entity={context.entity}
        onClose={handleDeregisterClose}
        onConfirm={handleDeregisterConfirm}
      />
    </>
  );
};
