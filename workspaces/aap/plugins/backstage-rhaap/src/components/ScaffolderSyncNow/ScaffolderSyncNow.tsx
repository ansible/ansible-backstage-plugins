import { useCallback, useEffect, useState } from 'react';
import {
  discoveryApiRef,
  errorApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  useIsSuperuser,
  SyncNowButton,
  SyncNowDialog,
  type SyncNowLastSyncTime,
  type SyncNowDialogOption,
} from '@ansible/portal-plugin-sdk';

type AapSyncType = 'orgsUsersTeams' | 'jobTemplates';

interface AapProviderSyncStatus {
  syncInProgress: boolean;
  lastSync: string | null;
  lastFailedSyncTime: string | null;
  lastSyncStatus: 'success' | 'failure' | null;
}

interface AapSyncStatus {
  orgsUsersTeams: AapProviderSyncStatus;
  jobTemplates: AapProviderSyncStatus;
}

interface SyncStatusResponse {
  aap?: {
    orgsUsersTeams?: Partial<AapProviderSyncStatus>;
    jobTemplates?: Partial<AapProviderSyncStatus>;
  };
}

interface SyncStartResponse {
  status?: string;
  error?: string;
}

const EMPTY_PROVIDER_STATUS: AapProviderSyncStatus = {
  syncInProgress: false,
  lastSync: null,
  lastFailedSyncTime: null,
  lastSyncStatus: null,
};

const AAP_SYNC_STATUS_PATH = '/ansible/sync/status/aap';
const LEGACY_SYNC_STATUS_PATH = '/ansible/sync/status?aap_entities=true';

let syncPending = false;
const syncPendingListeners = new Set<(pending: boolean) => void>();

function setSyncPending(pending: boolean) {
  syncPending = pending;
  syncPendingListeners.forEach(listener => listener(pending));
}

async function readSyncStatus(
  fetchApi: { fetch: (input: string) => Promise<Response> },
  baseUrl: string,
): Promise<SyncStatusResponse> {
  let response = await fetchApi.fetch(`${baseUrl}${AAP_SYNC_STATUS_PATH}`);

  // Older combined catalog installs expose only the legacy query endpoint.
  if (response.status === 404) {
    response = await fetchApi.fetch(`${baseUrl}${LEGACY_SYNC_STATUS_PATH}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to check sync status (${response.status})`);
  }
  return (await response.json()) as SyncStatusResponse;
}

function normalizeStatus(status: SyncStatusResponse): AapSyncStatus {
  if (!status.aap) {
    throw new Error('AAP sync status is unavailable');
  }

  return {
    orgsUsersTeams: {
      ...EMPTY_PROVIDER_STATUS,
      ...status.aap.orgsUsersTeams,
    },
    jobTemplates: {
      ...EMPTY_PROVIDER_STATUS,
      ...status.aap.jobTemplates,
    },
  };
}

function getLastSyncTimes(status: AapSyncStatus): SyncNowLastSyncTime[] {
  return [
    {
      label: 'Organizations, Users, and Teams',
      time: status.orgsUsersTeams.lastSync,
    },
    { label: 'Job Templates', time: status.jobTemplates.lastSync },
  ];
}

function getDialogOptions(status: AapSyncStatus): SyncNowDialogOption[] {
  return [
    {
      value: 'orgsUsersTeams',
      label: 'Organizations, Users, and Teams',
      lastSyncTime: status.orgsUsersTeams.lastSync,
    },
    {
      value: 'jobTemplates',
      label: 'Job Templates',
      lastSyncTime: status.jobTemplates.lastSync,
    },
  ];
}

function statusChanged(
  before: AapProviderSyncStatus,
  after: AapProviderSyncStatus,
): boolean {
  return (
    before.lastSync !== after.lastSync ||
    before.lastFailedSyncTime !== after.lastFailedSyncTime ||
    before.lastSyncStatus !== after.lastSyncStatus
  );
}

/** AAP sync action with source selection for the native Scaffolder templates page. */
export function ScaffolderSyncNow() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const errorApi = useApi(errorApiRef);
  const { isSuperuser, loading: checkingPermission } = useIsSuperuser();
  const [syncing, setSyncing] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<AapSyncStatus>({
    orgsUsersTeams: EMPTY_PROVIDER_STATUS,
    jobTemplates: EMPTY_PROVIDER_STATUS,
  });

  const fetchCurrentStatus = useCallback(async () => {
    const baseUrl = await discoveryApi.getBaseUrl('catalog');
    const response = await readSyncStatus(fetchApi, baseUrl);
    return { baseUrl, status: normalizeStatus(response) };
  }, [discoveryApi, fetchApi]);

  useEffect(() => {
    if (checkingPermission || !isSuperuser) return undefined;

    let mounted = true;
    setStatusLoading(true);
    void fetchCurrentStatus()
      .then(({ status }) => {
        if (mounted) setSyncStatus(status);
      })
      .catch(error => {
        if (mounted) {
          errorApi.post(
            error instanceof Error
              ? error
              : new Error('Failed to load AAP sync status'),
          );
        }
      })
      .finally(() => {
        if (mounted) setStatusLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [checkingPermission, errorApi, fetchCurrentStatus, isSuperuser]);

  useEffect(() => {
    syncPendingListeners.add(setSyncing);
    setSyncing(syncPending);
    return () => {
      syncPendingListeners.delete(setSyncing);
    };
  }, []);

  const handleOpenDialog = useCallback(() => {
    setDialogOpen(true);
    void fetchCurrentStatus()
      .then(({ status }) => setSyncStatus(status))
      .catch(error => {
        errorApi.post(
          error instanceof Error
            ? error
            : new Error('Failed to load AAP sync status'),
        );
      });
  }, [errorApi, fetchCurrentStatus]);

  const handleSync = useCallback(
    async (selectedValues: string[]) => {
      setDialogOpen(false);
      if (selectedValues.length === 0 || syncPending) return;

      const selected = selectedValues.filter(
        (value): value is AapSyncType =>
          value === 'orgsUsersTeams' || value === 'jobTemplates',
      );
      if (selected.length === 0) return;

      setSyncPending(true);
      try {
        const { baseUrl, status: baseline } = await fetchCurrentStatus();
        setSyncStatus(baseline);

        const accepted: AapSyncType[] = [];
        const triggerErrors: Error[] = [];
        for (const type of selected) {
          if (baseline[type].syncInProgress) {
            accepted.push(type);
            continue;
          }

          const endpoint =
            type === 'orgsUsersTeams'
              ? '/ansible/sync/from-aap/orgs_users_teams'
              : '/ansible/sync/from-aap/job_templates';

          try {
            const response = await fetchApi.fetch(`${baseUrl}${endpoint}`, {
              method: 'POST',
            });
            const result = (await response
              .json()
              .catch(() => ({}))) as SyncStartResponse;
            if (!response.ok) {
              throw new Error(
                result.error ?? `Failed to start sync (${response.status})`,
              );
            }
            if (
              result.status !== 'sync_started' &&
              result.status !== 'already_syncing'
            ) {
              throw new Error(result.error ?? `Failed to start ${type} sync`);
            }
            accepted.push(type);
          } catch (error) {
            triggerErrors.push(
              error instanceof Error
                ? error
                : new Error(`Failed to start ${type} sync`),
            );
          }
        }

        if (accepted.length === 0) {
          throw new Error(
            triggerErrors.map(error => error.message).join('; ') ||
              'No AAP sync options were accepted',
          );
        }

        const observedProgress: Record<AapSyncType, boolean> = {
          orgsUsersTeams: baseline.orgsUsersTeams.syncInProgress,
          jobTemplates: baseline.jobTemplates.syncInProgress,
        };
        const completed = new Set<AapSyncType>();
        const syncErrors: Error[] = [];

        for (let attempt = 0; attempt < 120; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          const { status: current } = await fetchCurrentStatus();
          setSyncStatus(current);

          for (const type of accepted) {
            const providerStatus = current[type];
            if (providerStatus.syncInProgress) {
              observedProgress[type] = true;
              continue;
            }

            if (
              observedProgress[type] ||
              statusChanged(baseline[type], providerStatus)
            ) {
              completed.add(type);
              if (
                providerStatus.lastSyncStatus === 'failure' &&
                providerStatus.lastFailedSyncTime !==
                  baseline[type].lastFailedSyncTime
              ) {
                syncErrors.push(new Error(`${type} sync failed`));
              }
            }
          }

          if (completed.size === accepted.length) break;
        }

        if (completed.size !== accepted.length) {
          throw new Error('Timed out waiting for AAP sync to finish');
        }
        if (triggerErrors.length > 0 || syncErrors.length > 0) {
          throw new Error(
            [...triggerErrors, ...syncErrors]
              .map(error => error.message)
              .join('; '),
          );
        }
      } catch (error) {
        errorApi.post(
          error instanceof Error
            ? error
            : new Error('Failed to sync AAP resources'),
        );
      } finally {
        setSyncPending(false);
      }
    },
    [errorApi, fetchApi, fetchCurrentStatus],
  );

  if (!checkingPermission && !isSuperuser) return null;

  const lastSyncTimes = getLastSyncTimes(syncStatus);
  const options = getDialogOptions(syncStatus);
  const syncInProgress =
    syncStatus.orgsUsersTeams.syncInProgress ||
    syncStatus.jobTemplates.syncInProgress;

  return (
    <>
      <SyncNowButton
        onClick={handleOpenDialog}
        disabled={checkingPermission || statusLoading || syncInProgress}
        loading={syncing}
        checkingPermission={checkingPermission || statusLoading}
        disabledReason={syncInProgress ? 'Sync in progress...' : undefined}
        lastSyncTimes={lastSyncTimes}
      />
      <SyncNowDialog
        open={dialogOpen}
        options={options}
        onCancel={() => setDialogOpen(false)}
        onConfirm={selected => void handleSync(selected)}
      />
    </>
  );
}
