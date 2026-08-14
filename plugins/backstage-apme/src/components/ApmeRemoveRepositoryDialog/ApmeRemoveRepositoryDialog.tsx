/*
 * Copyright Red Hat
 *
 * ADR-010: Confirm dialog hosted via getDetailOverlays so it survives menu close.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@material-ui/core';
import {
  alertApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import type { GitRepositoryDetailTabContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';
import { apmeApiRef } from '../../api';
import { removeManualGitRepository } from '../../utils/removeManualGitRepository';
import {
  clearRemoveRepositoryRequest,
  subscribeRemoveRepositoryDialog,
} from '../../utils/removeRepositoryDialogController';

export interface ApmeRemoveRepositoryDialogProps {
  context: GitRepositoryDetailTabContext;
}

/** Persistent Remove confirmation dialog for manually registered repos. */
export const ApmeRemoveRepositoryDialog = ({
  context,
}: ApmeRemoveRepositoryDialogProps) => {
  const enabled = useApmeEnabled();
  const navigate = useNavigate();
  const catalogApi = useApi(catalogApiRef);
  const apmeApi = useApi(apmeApiRef);
  const alertApi = useApi(alertApiRef);
  const [targetEntity, setTargetEntity] = useState<Entity | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    return subscribeRemoveRepositoryDialog(entity => {
      setTargetEntity(entity);
    });
  }, []);

  const open =
    Boolean(targetEntity) &&
    targetEntity?.metadata.name === context.entity.metadata.name;

  const displayName =
    targetEntity?.metadata.title ??
    targetEntity?.metadata.name ??
    'repository';

  const handleClose = useCallback(() => {
    if (removing) {
      return;
    }
    clearRemoveRepositoryRequest();
  }, [removing]);

  const handleConfirmRemove = useCallback(async () => {
    if (!targetEntity) {
      return;
    }
    setRemoving(true);
    try {
      await removeManualGitRepository({
        entity: targetEntity,
        catalogApi,
        apmeApi,
        apmeEnabled: enabled,
      });
      clearRemoveRepositoryRequest();
      alertApi.post({
        message: `Removed ${displayName} from the portal`,
        severity: 'success',
        display: 'transient',
      });
      navigate('/self-service/repositories/catalog');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to remove repository';
      alertApi.post({ message, severity: 'error' });
    } finally {
      setRemoving(false);
    }
  }, [
    alertApi,
    apmeApi,
    catalogApi,
    displayName,
    enabled,
    navigate,
    targetEntity,
  ]);

  if (!enabled) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Remove repository?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          This removes <strong>{displayName}</strong> from the Git
          Repositories catalog and deletes its APME quality project if one
          exists. This cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={removing}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleConfirmRemove()}
          color="secondary"
          variant="contained"
          disabled={removing}
          startIcon={
            removing ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {removing ? 'Removing…' : 'Remove'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
