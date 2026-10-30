import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useApi } from '@backstage/core-plugin-api';
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
import { useIsSuperuser } from '@ansible/portal-plugin-sdk';
import { automationContentApiRef, type Registry } from '../../../api';

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
  const { isSuperuser } = useIsSuperuser();
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
    if (!isSuperuser || inFlight.current || !selected.length) return;
    inFlight.current = true;
    setSyncing(true);
    setError('');
    try {
      const results = await Promise.all(
        selected.map(async name => ({
          name,
          result: await api.syncRegistry(name),
        })),
      );
      const status = results
        .map(
          ({ name, result }) =>
            `${name}: ${
              result.status === 'completed' ? 'sync completed' : 'sync failed'
            }`,
        )
        .join('; ');
      onSynced(status);
      if (results.some(({ result }) => result.status === 'failed'))
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
          isDisabled={!isSuperuser || !selected.length}
        >
          Sync selected
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
