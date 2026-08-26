/*
 * Copyright Red Hat
 *
 * ADR-010: Rendered via getDetailOverlays on the repository detail page,
 * outside the Actions menu, so the confirmation dialog is not torn down
 * when the menu closes.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { GitRepositoryDetailTabContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { DeregisterRepositoryDialog } from '../DeregisterRepositoryDialog';
import { deregisterRepositoryDialogStore } from './deregisterRepositoryDialogStore';

export interface ApmeDeregisterRepositoryOverlayProps {
  context: GitRepositoryDetailTabContext;
}

export const ApmeDeregisterRepositoryOverlay = ({
  context,
}: ApmeDeregisterRepositoryOverlayProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  useSyncExternalStore(
    deregisterRepositoryDialogStore.subscribe,
    deregisterRepositoryDialogStore.getState,
    deregisterRepositoryDialogStore.getState,
  );

  const open = deregisterRepositoryDialogStore.isOpenForEntity(context.entity);

  const handleClose = useCallback(() => {
    deregisterRepositoryDialogStore.close();
  }, []);

  const handleConfirm = useCallback(() => {
    deregisterRepositoryDialogStore.close();
    const currentPath = location.pathname;
    const repositoriesBase = currentPath.replace(/\/[^/]+$/, '');
    navigate(`${repositoriesBase}/catalog`);
  }, [location.pathname, navigate]);

  return (
    <DeregisterRepositoryDialog
      open={open}
      entity={context.entity}
      onClose={handleClose}
      onConfirm={handleConfirm}
    />
  );
};
