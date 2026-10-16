import { useState, useRef } from 'react';
import {
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@material-ui/core';
import type { ActionContribution } from '@ansible/portal-extension-api';
import type { Entity } from '@backstage/catalog-model';
import { ExtensionActionMenuItem } from './ExtensionRenderer';

/** Owns confirmation outside the menu so closing the menu cannot dismiss it. */
export function ExtensionActionMenu({
  contributions,
  entity,
  anchorEl,
  onClose,
  onSuccess,
}: {
  contributions: ActionContribution[];
  entity: Entity;
  anchorEl: HTMLElement | null;
  onClose(): void;
  onSuccess?: (result: unknown) => void;
}) {
  const [confirmation, setConfirmation] = useState<{
    contribution: ActionContribution;
    execute: () => Promise<boolean>;
  }>();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const confirm = async () => {
    if (!confirmation || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      if (await confirmation.execute()) setConfirmation(undefined);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  const details = confirmation?.contribution.confirmation;
  return (
    <>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
        {contributions.map(contribution => (
          <ExtensionActionMenuItem
            key={contribution.id}
            contribution={contribution}
            entity={entity}
            onMenuClose={onClose}
            onSuccess={onSuccess}
            onRequestConfirmation={execute => {
              setConfirmation({ contribution, execute });
              onClose();
            }}
          />
        ))}
      </Menu>
      <Dialog
        open={Boolean(confirmation)}
        onClose={() => {
          if (!pending) setConfirmation(undefined);
        }}
      >
        <DialogTitle>{details?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{details?.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={pending} onClick={() => setConfirmation(undefined)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            color="secondary"
            onClick={() => {
              void confirm();
            }}
          >
            {details?.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
