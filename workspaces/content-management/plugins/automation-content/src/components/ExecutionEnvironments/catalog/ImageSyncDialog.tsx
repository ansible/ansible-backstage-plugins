import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { useNotifications } from '@ansible/portal-plugin-sdk';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import {
  automationContentApiRef,
  ContentApiError,
  type Registry,
} from '../../../api';

/** Registry-selection integration seam for the prototype image sync dialog. */
export function ImageSyncDialog({
  open,
  onClose,
  onSynced,
}: {
  open: boolean;
  onClose: () => void;
  onSynced: (status: string) => void;
}): ReactElement {
  const api = useApi(automationContentApiRef);
  const { showNotification } = useNotifications();
  const { allowed: canSync } = usePermission({
    permission: automationContentSyncPermission,
  });
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSelected([]);
    api
      .listRegistries()
      .then(result => {
        if (!cancelled) setRegistries(result);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load registries');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, open]);
  const sync = async () => {
    if (!canSync || inFlight.current || !selected.length) return;
    inFlight.current = true;
    setSyncing(true);
    setError('');
    try {
      showNotification({
        title: 'Sync started',
        description: selected.join(', '),
        severity: 'info',
      });
      const results = await Promise.allSettled(
        selected.map(name => api.syncRegistry(name)),
      );
      results.forEach((result, index) => {
        const ok =
          result.status === 'fulfilled' && result.value.status === 'completed';
        const accessNeeded =
          result.status === 'rejected' &&
          result.reason instanceof ContentApiError &&
          result.reason.status === 403;
        let description = accessNeeded
          ? 'Sync access needed for this registry.'
          : 'Registry reconciliation failed.';
        if (ok && result.status === 'fulfilled')
          description = `${result.value.discovered} artifacts discovered`;
        showNotification({
          title: `${selected[index]}: ${ok ? 'sync complete' : 'sync failed'}`,
          description,
          severity: ok ? 'success' : 'error',
        });
      });
      const status = results
        .map((result, index) => {
          if (result.status === 'rejected') {
            const reason =
              result.reason instanceof ContentApiError &&
              result.reason.status === 403
                ? 'sync access needed'
                : 'sync failed';
            return `${selected[index]}: ${reason}`;
          }
          return `${selected[index]}: ${
            result.value.status === 'completed'
              ? 'sync completed'
              : 'sync failed'
          }`;
        })
        .join('; ');
      onSynced(status);
      if (
        results.some(
          result =>
            result.status === 'rejected' || result.value.status !== 'completed',
        )
      )
        setError(status);
      else onClose();
    } catch {
      setError('Sync failed. Retry when the content service is available.');
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  };
  return (
    <Dialog
      isOpen={open}
      onOpenChange={value => !value && !syncing && onClose()}
    >
      <DialogHeader>Sync execution environments</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text>Select registries to sync execution environment images.</Text>
          {loading && <Text role="status">Loading registries…</Text>}
          {error && <Text role="alert">{error}</Text>}
          {!loading && !registries.length && (
            <Text>No registries configured</Text>
          )}
          {!!registries.length && (
            <Checkbox
              isSelected={selected.length === registries.length}
              isIndeterminate={
                selected.length > 0 && selected.length < registries.length
              }
              isDisabled={syncing}
              onChange={checked =>
                setSelected(
                  checked ? registries.map(registry => registry.name) : [],
                )
              }
            >
              Select all
            </Checkbox>
          )}
          {registries.map(registry => (
            <Checkbox
              key={registry.name}
              isDisabled={syncing}
              isSelected={selected.includes(registry.name)}
              onChange={checked =>
                setSelected(previous =>
                  checked
                    ? [...previous, registry.name]
                    : previous.filter(name => name !== registry.name),
                )
              }
            >
              {registry.name}
            </Checkbox>
          ))}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={onClose} isDisabled={syncing}>
          Cancel
        </Button>
        <Button
          onPress={sync}
          isPending={syncing}
          isDisabled={!canSync || !selected.length}
        >
          Sync selected
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
