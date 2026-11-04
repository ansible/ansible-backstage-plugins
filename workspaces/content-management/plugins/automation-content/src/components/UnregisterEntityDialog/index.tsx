import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Entity } from '@backstage/catalog-model';
import { alertApiRef, configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Skeleton,
  Text,
} from '@backstage/ui';
import { useUnregisterEntityDialogState } from './useUnregisterEntityDialogState';

function DialogContents({
  entity,
  onConfirm,
  onClose,
}: {
  entity: Entity;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const state = useUnregisterEntityDialogState(entity);
  const alertApi = useApi(alertApiRef);
  const appTitle =
    useApi(configApiRef).getOptionalString('app.title') ?? 'Backstage';
  const [busyAction, setBusyAction] = useState<'delete' | 'unregister' | null>(
    null,
  );
  const perform = async (action: 'delete' | 'unregister') => {
    setBusyAction(action);
    try {
      if (action === 'unregister' && 'unregisterLocation' in state)
        await state.unregisterLocation();
      else if ('deleteEntity' in state) await state.deleteEntity();
      onConfirm();
      if (action === 'delete')
        alertApi.post({
          message: `Removed entity ${
            entity.metadata.title ?? entity.metadata.name
          }`,
          severity: 'success',
          display: 'transient',
        });
    } catch (err) {
      let message = 'Unknown error';
      if (err instanceof Error) message = err.message;
      else if (typeof err === 'string') message = err;
      alertApi.post({ message });
    } finally {
      setBusyAction(null);
    }
  };
  const deleteButton = (
    <Button
      destructive
      isDisabled={busyAction !== null}
      isPending={busyAction === 'delete'}
      onPress={() => perform('delete')}
    >
      Delete Entity
    </Button>
  );
  return (
    <>
      <DialogHeader>
        Are you sure you want to unregister this entity?
      </DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          {state.type === 'loading' && <Skeleton width="100%" height={48} />}
          {state.type === 'error' && (
            <Text role="alert">{state.error.message}</Text>
          )}
          {state.type === 'only-delete' && (
            <Text>
              This entity does not seem to originate from a registered location.
              You therefore only have the option to delete it outright from the
              catalog.
            </Text>
          )}
          {state.type === 'bootstrap' && (
            <Text>
              You cannot unregister this entity, since it originates from a
              protected Backstage configuration (location &quot;{state.location}
              &quot;). If you believe this is in error, please contact the{' '}
              {appTitle} integrator.
            </Text>
          )}
          {state.type === 'unregister' && (
            <>
              <Text>This action will unregister the following entities:</Text>
              <ul>
                {state.colocatedEntities.map(e => (
                  <li key={`${e.kind}:${e.namespace}/${e.name}`}>
                    {e.kind}:{e.namespace}/{e.name}
                  </li>
                ))}
              </ul>
              <Text>Located at the following location:</Text>
              <ul>
                <li>{state.location}</li>
              </ul>
              <Text>To undo, just re-register the entity in {appTitle}.</Text>
            </>
          )}
          {(state.type === 'bootstrap' || state.type === 'unregister') && (
            <details>
              <summary>Advanced Options</summary>
              <Flex direction="column" gap="3">
                <Text>
                  {state.type === 'bootstrap'
                    ? 'You have the option to delete the entity itself from the catalog.'
                    : 'You also have the option to delete the entity itself from the catalog.'}{' '}
                  Note that this should only be done if you know that the
                  catalog file has been deleted at, or moved from, its origin
                  location. If that is not the case, the entity will reappear
                  shortly as the next refresh round is performed by the catalog.
                </Text>
                {deleteButton}
              </Flex>
            </details>
          )}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          onPress={onClose}
          variant="secondary"
          isDisabled={busyAction !== null}
        >
          Cancel
        </Button>
        {state.type === 'only-delete' && deleteButton}
        {state.type === 'unregister' && (
          <Button
            destructive
            isDisabled={busyAction !== null}
            isPending={busyAction === 'unregister'}
            onPress={() => perform('unregister')}
          >
            Unregister Location
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/** Prototype location-aware unregister/delete flow. */
export function UnregisterEntityDialog({
  open,
  onConfirm,
  onClose,
  entity,
}: Readonly<{
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
  entity: Entity;
}>): ReactElement {
  return (
    <Dialog isOpen={open} onOpenChange={value => !value && onClose()}>
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
