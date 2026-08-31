/*
 * Copyright Red Hat
 *
 * ADR-010: Rendered via getDetailOverlays on the repository detail page,
 * outside the Actions menu, so the confirmation dialog is not torn down
 * when the menu closes.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GitRepositoryDetailTabContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { DeregisterRepositoryDialog } from '../DeregisterRepositoryDialog';
import { deregisterRepositoryDialogStore } from './deregisterRepositoryDialogStore';

export interface ApmeDeregisterRepositoryOverlayProps {
  context: GitRepositoryDetailTabContext;
}

/**
 * ADR-010 overlay: subscribes to the dialog store and renders
 * DeregisterRepositoryDialog when the current entity matches.
 * Must be mounted on the repository detail page (via getDetailOverlays).
 */
export const ApmeDeregisterRepositoryOverlay = ({
  context,
}: ApmeDeregisterRepositoryOverlayProps) => {
  const navigate = useNavigate();

  const storeState = useSyncExternalStore(
    deregisterRepositoryDialogStore.subscribe,
    deregisterRepositoryDialogStore.getState,
    deregisterRepositoryDialogStore.getState,
  );

  const open = deregisterRepositoryDialogStore.isOpenForEntity(context.entity);

  const handleClose = useCallback(() => {
    deregisterRepositoryDialogStore.close();
  }, []);

  const handleConfirm = useCallback(() => {
    const { redirectPath } = storeState;
    deregisterRepositoryDialogStore.close();
    if (redirectPath) {
      navigate(redirectPath);
    }
  }, [storeState, navigate]);

  return (
    <DeregisterRepositoryDialog
      open={open}
      entity={context.entity}
      onClose={handleClose}
      onConfirm={handleConfirm}
    />
  );
};
