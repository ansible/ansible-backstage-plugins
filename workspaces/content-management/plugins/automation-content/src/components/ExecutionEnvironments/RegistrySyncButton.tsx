import { useRef, useState, type ReactElement } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { Button } from '@backstage/ui';
import SyncIcon from '@material-ui/icons/Sync';
import { useIsSuperuser, useNotifications } from '@ansible/portal-plugin-sdk';
import { automationContentApiRef } from '../../api';

/** Sync every configured registry with per-registry notification feedback. */
export function RegistrySyncButton({
  onStatus,
  onSynced,
}: {
  onStatus: (status: string) => void;
  onSynced: () => void;
}): ReactElement | null {
  const api = useApi(automationContentApiRef);
  const { isSuperuser } = useIsSuperuser();
  const { showNotification } = useNotifications();
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);
  const sync = async () => {
    if (!isSuperuser || inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    onStatus('Syncing configured registries');
    try {
      const result = await api.syncAll();
      for (const registry of result.registries) {
        showNotification({
          title: `${registry.registry}: ${
            registry.ok ? 'sync complete' : 'sync failed'
          }`,
          description: registry.ok
            ? `${registry.discovered} artifacts discovered`
            : 'Registry reconciliation failed.',
          severity: registry.ok ? 'success' : 'error',
        });
      }
      onStatus(
        result.registries.some(registry => !registry.ok)
          ? 'Sync completed with registry failures'
          : 'Sync completed',
      );
      onSynced();
    } catch {
      onStatus('Sync failed. Retry when the content service is available.');
      showNotification({
        title: 'Content sync failed',
        description: 'The content service could not complete the sync.',
        severity: 'error',
      });
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  };
  return isSuperuser ? (
    <Button
      variant="secondary"
      iconStart={<SyncIcon />}
      isPending={syncing}
      isDisabled={syncing}
      onPress={sync}
    >
      Sync
    </Button>
  ) : null;
}
