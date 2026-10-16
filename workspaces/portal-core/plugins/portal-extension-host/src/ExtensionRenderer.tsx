import { Suspense, useState, useRef, type ComponentType } from 'react';
import {
  CircularProgress,
  ListItemIcon,
  MenuItem,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@material-ui/core';
import { useApiHolder, alertApiRef } from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { portalOperationsApiRef } from '@ansible/portal-extension-api';
import { usePermission } from '@backstage/plugin-permission-react';
import type { Entity } from '@backstage/catalog-model';
import type {
  TabContribution,
  CardContribution,
  ActionContribution,
} from '@ansible/portal-extension-api';
import { ErrorBoundary } from './ErrorBoundary';
import { ContributionWrapper } from './ContributionWrapper';

const Fallback = () => (
  <CircularProgress
    size={24}
    style={{ display: 'block', margin: '16px auto' }}
  />
);

/** Renders a tab contribution's component inside `<Suspense>`.
 *  Returns null while loading or if the user lacks the required permission.
 *  Injects portal CSS custom properties (`--portal-color-*`) on a
 *  `display: contents` wrapper so contributed components can use them
 *  without importing MUI or Backstage theme utilities. */
export const ExtensionTabContent = ({
  contribution,
  entity,
}: {
  contribution: TabContribution;
  entity?: Entity;
}) => {
  const { allowed } = usePermission({
    permission: contribution.permission ?? null!,
  });

  if (contribution.permission && !allowed) return null;

  const Component = contribution.component as ComponentType<{
    entity?: Entity;
  }>;
  return (
    <ContributionWrapper>
      <ErrorBoundary contributionId={contribution.id}>
        <Suspense fallback={<Fallback />}>
          <Component entity={entity} />
        </Suspense>
      </ErrorBoundary>
    </ContributionWrapper>
  );
};

/** Renders a card contribution's component inside `<ErrorBoundary>` + `<Suspense>`.
 *  Returns null while loading or if the user lacks the required permission.
 *  Injects portal CSS custom properties (`--portal-color-*`) on a
 *  `display: contents` wrapper so contributed components can use them
 *  without importing MUI or Backstage theme utilities. */
export const ExtensionCardContent = ({
  contribution,
  entity,
}: {
  contribution: CardContribution;
  entity?: Entity;
}) => {
  const { allowed } = usePermission({
    permission: contribution.permission ?? null!,
  });

  if (contribution.permission && !allowed) return null;

  const Component = contribution.component as ComponentType<{
    entity?: Entity;
  }>;
  return (
    <ContributionWrapper>
      <ErrorBoundary contributionId={contribution.id}>
        <Suspense fallback={<Fallback />}>
          <Component entity={entity} />
        </Suspense>
      </ErrorBoundary>
    </ContributionWrapper>
  );
};

/**
 * Builds an action activation wrapper that:
 * 1. Evaluates the `permission` gate.
 * 2. Injects `getApi` via `useApiHolder()` into the `ActionContext`.
 *
 * Must be called inside a React component (uses hooks).
 *
 * Note: `onActivate` is for pure UI effects only (navigation, dialogs).
 * For server-side effects, the contribution should use `launches` instead.
 */
export const useActionActivation = (
  contribution: ActionContribution,
  entity: Entity,
) => {
  const apiHolder = useApiHolder();
  const { allowed } = usePermission({
    permission: contribution.permission ?? null!,
  });

  if (contribution.permission && !allowed) return null;

  return async () => {
    if (contribution.launches) {
      const launch = contribution.launches;
      if (launch.type !== 'operation') {
        throw new Error(`No host launcher installed for ${launch.type}`);
      }
      // Fail before mutation if the requested follow-on cannot be honored.
      if (launch.followOn) {
        throw new Error('No host follow-on launcher installed');
      }
      const operations = apiHolder.get(portalOperationsApiRef);
      if (!operations)
        throw new Error('Portal operations API is not installed');
      const response = await operations.execute(launch.operationId, {
        subject: { entityRef: stringifyEntityRef(entity) },
      });
      return response.result;
    }
    await contribution.onActivate?.({
      entity,
      getApi: apiRef => apiHolder.get(apiRef)!,
    });
    return undefined;
  };
};

/** Renders a single action contribution as a `<MenuItem>`.
 *  Handles permission gating and `getApi` injection internally.
 *  Returns null when the user lacks the required permission. */
export const ExtensionActionMenuItem = ({
  contribution,
  entity,
  onMenuClose,
  onRequestConfirmation,
  onSuccess,
}: {
  contribution: ActionContribution;
  entity: Entity;
  onMenuClose: () => void;
  onRequestConfirmation?: (execute: () => Promise<boolean>) => void;
  onSuccess?: (result: unknown) => void;
}) => {
  const activate = useActionActivation(contribution, entity);
  const apiHolder = useApiHolder();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  if (!activate) return null;

  const run = async () => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    try {
      const result = await activate();
      if (contribution.launches?.type === 'operation') {
        apiHolder.get(alertApiRef)?.post({
          message: `${contribution.label}: request accepted`,
          severity: 'success',
        });
      }
      setConfirmOpen(false);
      onSuccess?.(result);
      onMenuClose();
      return true;
    } catch (error) {
      apiHolder.get(alertApiRef)?.post({
        message: error instanceof Error ? error.message : 'Action failed',
        severity: 'error',
      });
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const Icon = contribution.icon;
  return (
    <>
      <MenuItem
        disabled={pending}
        onClick={() => {
          if (contribution.confirmation && onRequestConfirmation)
            onRequestConfirmation(run);
          else if (contribution.confirmation) setConfirmOpen(true);
          else void run();
        }}
      >
        {Icon && (
          <ListItemIcon style={{ minWidth: 36 }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Icon {...({ fontSize: 'small' } as any)} />
          </ListItemIcon>
        )}
        <Typography variant="body2">{contribution.label}</Typography>
      </MenuItem>
      {contribution.confirmation && !onRequestConfirmation && (
        <Dialog
          open={confirmOpen}
          onClose={() => {
            if (!pending) setConfirmOpen(false);
          }}
        >
          <DialogTitle>{contribution.confirmation.title}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {contribution.confirmation.message}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button disabled={pending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                void run();
              }}
              color="secondary"
            >
              {contribution.confirmation.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
};
