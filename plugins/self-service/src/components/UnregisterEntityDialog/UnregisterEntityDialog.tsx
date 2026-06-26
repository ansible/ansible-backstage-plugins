import type { Entity } from '@backstage/catalog-model';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { alertApiRef, configApiRef, useApi } from '@backstage/core-plugin-api';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { Alert } from '@material-ui/lab';
import { useCallback, useState } from 'react';
import {
  useUnregisterEntityDialogState,
  type DialogState,
} from './useUnregisterEntityDialogState';

type BusyAction = 'unregister' | 'delete' | null;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'Unknown error';
}

/** Props for the local UnregisterEntityDialog that replaces the broken upstream BUI version. */
export type UnregisterEntityDialogProps = Readonly<{
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
  entity: Entity;
}>;

const useStyles = makeStyles(theme => ({
  content: {
    overflowWrap: 'break-word',
  },
  advancedAccordion: {
    marginTop: theme.spacing(2),
    '&::before': {
      display: 'none',
    },
  },
  advancedDeleteButton: {
    marginTop: theme.spacing(1),
  },
}));

function useDialogHandlers(entity: Entity, onConfirm: () => void) {
  const alertApi = useApi(alertApiRef);
  const state = useUnregisterEntityDialogState(entity);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  const onUnregister = useCallback(async () => {
    if ('unregisterLocation' in state) {
      setBusyAction('unregister');
      try {
        await state.unregisterLocation();
        onConfirm();
      } catch (err) {
        alertApi.post({ message: errorMessage(err) });
      } finally {
        setBusyAction(null);
      }
    }
  }, [alertApi, onConfirm, state]);

  const onDelete = useCallback(async () => {
    if ('deleteEntity' in state) {
      setBusyAction('delete');
      try {
        await state.deleteEntity();
        const entityName = entity.metadata.title ?? entity.metadata.name;
        onConfirm();
        alertApi.post({
          message: `Removed entity ${entityName}`,
          severity: 'success',
          display: 'transient',
        });
      } catch (err) {
        alertApi.post({ message: errorMessage(err) });
      } finally {
        setBusyAction(null);
      }
    }
  }, [alertApi, onConfirm, state, entity]);

  return { state, busyAction, onUnregister, onDelete };
}

function AdvancedDeleteSection({
  triggerTitle,
  description,
  onDelete,
  busyAction,
}: Readonly<{
  triggerTitle: string;
  description: string;
  onDelete: () => void;
  busyAction: BusyAction;
}>) {
  const classes = useStyles();

  return (
    <Accordion className={classes.advancedAccordion}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">{triggerTitle}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <div>
          <Typography variant="body2">{description}</Typography>
          <Button
            className={classes.advancedDeleteButton}
            variant="contained"
            color="secondary"
            disabled={busyAction !== null}
            onClick={onDelete}
            startIcon={
              busyAction === 'delete' ? (
                <CircularProgress size={18} color="inherit" />
              ) : null
            }
          >
            Delete Entity
          </Button>
        </div>
      </AccordionDetails>
    </Accordion>
  );
}

function BootstrapBody({
  location,
  appTitle,
  onDelete,
  busyAction,
}: Readonly<{
  location: string;
  appTitle: string;
  onDelete: () => void;
  busyAction: BusyAction;
}>) {
  return (
    <>
      <Alert severity="info">
        You cannot unregister this entity, since it originates from a protected
        Backstage configuration (location &quot;{location}
        &quot;). If you believe this is in error, please contact the {
          appTitle
        }{' '}
        integrator.
      </Alert>
      <AdvancedDeleteSection
        triggerTitle="Advanced Options"
        description="You have the option to delete the entity itself from the catalog. Note that this should only be done if you know that the catalog file has been deleted at, or moved from, its origin location. If that is not the case, the entity will reappear shortly as the next refresh round is performed by the catalog."
        onDelete={onDelete}
        busyAction={busyAction}
      />
    </>
  );
}

function OnlyDeleteBody() {
  return (
    <Typography variant="body1">
      This entity does not seem to originate from a registered location. You
      therefore only have the option to delete it outright from the catalog.
    </Typography>
  );
}

function UnregisterBody({
  state,
  appTitle,
  onDelete,
  busyAction,
}: Readonly<{
  state: Extract<DialogState, { type: 'unregister' }>;
  appTitle: string;
  onDelete: () => void;
  busyAction: BusyAction;
}>) {
  return (
    <>
      <Typography variant="body1">
        This action will unregister the following entities:
      </Typography>
      <ul>
        {state.colocatedEntities.map(e => (
          <li key={`${e.kind}:${e.namespace}/${e.name}`}>
            <EntityRefLink entityRef={e} />
          </li>
        ))}
      </ul>
      <Typography variant="body1">
        Located at the following location:
      </Typography>
      <ul>
        <li>{state.location}</li>
      </ul>
      <Typography variant="body1">
        To undo, just re-register the entity in {appTitle}.
      </Typography>
      <AdvancedDeleteSection
        triggerTitle="Advanced Options"
        description="You also have the option to delete the entity itself from the catalog. Note that this should only be done if you know that the catalog file has been deleted at, or moved from, its origin location. If that is not the case, the entity will reappear shortly as the next refresh round is performed by the catalog."
        onDelete={onDelete}
        busyAction={busyAction}
      />
    </>
  );
}

function getDialogContent({
  state,
  appTitle,
  busyAction,
  onUnregister,
  onDelete,
}: {
  state: DialogState;
  appTitle: string;
  busyAction: BusyAction;
  onUnregister: () => void;
  onDelete: () => void;
}) {
  switch (state.type) {
    case 'loading':
      return { body: <Progress />, actionButton: null };
    case 'error':
      return {
        body: <ResponseErrorPanel error={state.error} />,
        actionButton: null,
      };
    case 'bootstrap':
      return {
        body: (
          <BootstrapBody
            location={state.location}
            appTitle={appTitle}
            onDelete={onDelete}
            busyAction={busyAction}
          />
        ),
        actionButton: null,
      };
    case 'only-delete':
      return {
        body: <OnlyDeleteBody />,
        actionButton: (
          <Button
            variant="contained"
            color="secondary"
            disabled={busyAction !== null}
            onClick={onDelete}
            startIcon={
              busyAction === 'delete' ? (
                <CircularProgress size={18} color="inherit" />
              ) : null
            }
          >
            Delete Entity
          </Button>
        ),
      };
    case 'unregister':
      return {
        body: (
          <UnregisterBody
            state={state}
            appTitle={appTitle}
            onDelete={onDelete}
            busyAction={busyAction}
          />
        ),
        actionButton: (
          <Button
            variant="contained"
            color="secondary"
            disabled={busyAction !== null}
            onClick={onUnregister}
            startIcon={
              busyAction === 'unregister' ? (
                <CircularProgress size={18} color="inherit" />
              ) : null
            }
          >
            Unregister Location
          </Button>
        ),
      };
    default:
      return {
        body: <Alert severity="error">Internal error: Unknown state</Alert>,
        actionButton: null,
      };
  }
}

function DialogContents({
  entity,
  onConfirm,
  onClose,
}: Readonly<{
  entity: Entity;
  onConfirm: () => void;
  onClose: () => void;
}>) {
  const classes = useStyles();
  const configApi = useApi(configApiRef);
  const appTitle = configApi.getOptionalString('app.title') ?? 'Backstage';
  const { state, busyAction, onUnregister, onDelete } = useDialogHandlers(
    entity,
    onConfirm,
  );
  const { body, actionButton } = getDialogContent({
    state,
    appTitle,
    busyAction,
    onUnregister,
    onDelete,
  });

  return (
    <>
      <DialogTitle>
        Are you sure you want to unregister this entity?
      </DialogTitle>
      <DialogContent className={classes.content}>{body}</DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Cancel
        </Button>
        {actionButton}
      </DialogActions>
    </>
  );
}

export function UnregisterEntityDialog({
  open,
  onConfirm,
  onClose,
  entity,
}: UnregisterEntityDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {open && (
        <DialogContents
          entity={entity}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}
