import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useSignal } from '@backstage/plugin-signals-react';
import { useNavigate } from 'react-router';
import { Route, Routes, Navigate } from 'react-router-dom';
import { Button, Snackbar, Tooltip, Typography } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import { Content, Page } from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  usePermission,
  RequirePermission,
} from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import {
  CatalogFilterLayout,
  EntityKindPicker,
  EntityOwnerPicker,
  EntitySearchBar,
  UserListPicker,
} from '@backstage/plugin-catalog-react';
import { templatesViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import { useIsSuperuser } from '../../hooks';
import { rootRouteRef } from '../../routes';
import { ansibleApiRef } from '../../apis';
import type { SyncProgressEntry, SyncOutcome } from '../common';
import {
  SYNC_FAILED_CATEGORY,
  SYNC_WARNING_CATEGORY,
  useShellPageStyles,
} from '../common';
import { CatalogItemsDetails } from '../CatalogItemDetails';
import { CreateTask } from '../CreateTask';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '../notifications';
import { SourcePicker } from '../utils/SourcePicker';
import { HomeCategoryPicker, HomeTagPicker } from './filters';
import { JobTemplatesProvider, useJobTemplates } from './JobTemplatesProvider';
import { LoadingTemplatesPlaceholder } from './LoadingTemplatesPlaceholder';
import { SyncConfirmationDialog } from './SyncConfirmationDialog';
import {
  TemplatesCatalogProvider,
  TemplateGrid,
  invalidateTemplatesCatalog,
} from './templatesCatalog';
import { TemplatesPageHeaderSection } from './TemplatesPageHeaderSection';

/** When the first post sync AAP list matches pre sync, a second fetch may still be stale, wait before retrying. */
const JOB_TEMPLATE_LIST_STALE_RETRY_MS = 450;

/** Used to detect AAP job template list changes after sync. */
const serializeJobTemplateKey = (t: { id: number; name: string }) =>
  `${t.id}:${t.name}`;

const jobTemplateListsDiffer = (
  prev: { id: number; name: string }[],
  next: { id: number; name: string }[],
): boolean => {
  if (prev.length !== next.length) {
    return true;
  }
  const prevKeys = new Set(prev.map(serializeJobTemplateKey));
  return next.some(t => !prevKeys.has(serializeJobTemplateKey(t)));
};

function displayNameForAapSyncProvider(provider: string): string {
  return provider.startsWith('aap-job-template')
    ? 'Job Templates'
    : 'Organizations, Users, and Teams';
}

type HomeCatalogPanelProps = {
  jobTemplateIds: number[];
  selectedSources: string[];
  /** Remount only when source filters change — not on JT sync. */
  listKey: string;
  syncKey: number;
  externalLoading: boolean;
  onSourceChange: (sources: string[]) => void;
};

/**
 * Mounted EntityListProvider + filters/grid. Soft refresh via
 * invalidateTemplatesCatalog keeps this tree mounted across JT sync.
 */
function HomeCatalogPanel({
  jobTemplateIds,
  selectedSources,
  listKey,
  syncKey,
  externalLoading,
  onSourceChange,
}: Readonly<HomeCatalogPanelProps>) {
  return (
    <TemplatesCatalogProvider
      jobTemplateIds={jobTemplateIds}
      selectedSources={selectedSources}
      listKey={listKey}
    >
      <CatalogFilterLayout>
        <CatalogFilterLayout.Filters>
          <div data-testid="search-bar-container">
            <EntitySearchBar />
          </div>
          <EntityKindPicker initialFilter="template" hidden />
          <div data-testid="user-picker-container">
            <UserListPicker
              initialFilter="all"
              availableFilters={['all', 'starred']}
            />
          </div>
          <div data-testid="categories-picker">
            <HomeCategoryPicker syncKey={syncKey} />
          </div>
          <HomeTagPicker syncKey={syncKey} />
          <SourcePicker
            syncKey={syncKey}
            selectedSources={selectedSources}
            onSourceChange={onSourceChange}
          />
          <EntityOwnerPicker />
        </CatalogFilterLayout.Filters>
        <CatalogFilterLayout.Content>
          <TemplateGrid externalLoading={externalLoading} />
        </CatalogFilterLayout.Content>
      </CatalogFilterLayout>
    </TemplatesCatalogProvider>
  );
}

export const HomeComponent = () => {
  const navigate = useNavigate();
  const shellPageClasses = useShellPageStyles();
  const rootLink = useRouteRef(rootRouteRef);
  const ansibleApi = useApi(ansibleApiRef);
  const { showNotification } = useNotifications();
  const {
    jobTemplates,
    loadState: jobTemplatesLoadState,
    errorMessage: jobTemplatesErrorMessage,
    refreshJobTemplates,
  } = useJobTemplates();
  const { isSuperuser, loading: checkingSuperuser } = useIsSuperuser();

  const { loading: checkingCatalogCreate, allowed: canCreateCatalogEntity } =
    usePermission({ permission: catalogEntityCreatePermission });
  const checkingAddTemplate = checkingSuperuser || checkingCatalogCreate;
  const showAddTemplate = checkingSuperuser
    ? true
    : isSuperuser && (checkingCatalogCreate || canCreateCatalogEntity);
  const addTemplateDisabled = checkingAddTemplate;
  const [open, setOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [syncOptions, setSyncOptions] = useState<string[]>([]);
  const [controllerSnackbar, setControllerSnackbar] = useState<
    { status: 'idle' } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [syncKey, setSyncKey] = useState(0);
  type SyncProviderStatus = {
    lastSync: string | null;
    syncInProgress: boolean;
    lastSyncStatus: 'success' | 'failure' | null;
  };
  const [syncStatus, setSyncStatus] = useState<{
    orgsUsersTeams: SyncProviderStatus;
    jobTemplates: SyncProviderStatus;
  }>({
    orgsUsersTeams: {
      lastSync: null,
      syncInProgress: false,
      lastSyncStatus: null,
    },
    jobTemplates: {
      lastSync: null,
      syncInProgress: false,
      lastSyncStatus: null,
    },
  });
  const [localSyncing, setLocalSyncing] = useState(false);
  const [activeSyncTypes, setActiveSyncTypes] = useState<string[]>([]);
  const notifiedSyncOutcomesRef = useRef<Set<string>>(new Set());
  const { lastSignal: syncSignal } = useSignal<{
    provider: string;
    syncInProgress: boolean;
    lastSyncTime: string | null;
    lastSyncStatus: 'success' | 'failure' | null;
    lastFailedSyncTime: string | null;
    lastDuplicateEntityCount?: number;
    lastMissingOrganizations?: string[];
  }>('catalog:aap-sync-status');

  useEffect(() => {
    if (!syncSignal) return;
    const isJT = syncSignal.provider.startsWith('aap-job-template');
    const key = isJT ? 'jobTemplates' : 'orgsUsersTeams';
    setSyncStatus(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        lastSync: syncSignal.syncInProgress
          ? prev[key].lastSync
          : syncSignal.lastSyncTime,
        syncInProgress: syncSignal.syncInProgress,
        lastSyncStatus: syncSignal.syncInProgress
          ? prev[key].lastSyncStatus
          : syncSignal.lastSyncStatus,
      },
    }));

    if (syncSignal.syncInProgress) {
      return;
    }

    const displayName = displayNameForAapSyncProvider(syncSignal.provider);
    const outcomeKey = [
      syncSignal.provider,
      syncSignal.lastSyncTime ?? '',
      syncSignal.lastFailedSyncTime ?? '',
      syncSignal.lastSyncStatus ?? '',
      String(syncSignal.lastDuplicateEntityCount ?? 0),
      (syncSignal.lastMissingOrganizations ?? []).join(','),
    ].join('|');
    if (notifiedSyncOutcomesRef.current.has(outcomeKey)) {
      return;
    }
    notifiedSyncOutcomesRef.current.add(outcomeKey);

    if (syncSignal.lastSyncStatus === 'success') {
      // Healthy AAP sync stays quiet — header / popover already show completion.
      // Toast only for soft issues (duplicates, missing orgs).
      const duplicateCount = syncSignal.lastDuplicateEntityCount ?? 0;
      const missingOrgs = syncSignal.lastMissingOrganizations ?? [];

      if (duplicateCount > 0) {
        const entityWord = duplicateCount === 1 ? 'entity' : 'entities';
        showNotification({
          title: 'Sync warning',
          description: `Skipped ${duplicateCount} duplicate catalog ${entityWord} during ${displayName} sync.`,
          severity: 'warning',
          category: SYNC_WARNING_CATEGORY,
          autoHideDuration: 0,
        });
      }

      if (missingOrgs.length > 0) {
        const orgList = missingOrgs.map(name => `'${name}'`).join(', ');
        const orgWord =
          missingOrgs.length === 1 ? 'organization' : 'organizations';
        showNotification({
          title: 'Sync warning',
          description: `Configured ${orgWord} ${orgList} not found in AAP during ${displayName} sync.`,
          severity: 'warning',
          category: SYNC_WARNING_CATEGORY,
          autoHideDuration: 0,
        });
      }
      return;
    }

    if (syncSignal.lastSyncStatus === 'failure') {
      showNotification({
        title: 'Sync failed',
        description: `Failed to sync content from ${displayName}.`,
        severity: 'error',
        category: SYNC_FAILED_CATEGORY,
        autoHideDuration: 0,
      });
    }
  }, [syncSignal, showNotification]);

  const isSyncInProgress =
    localSyncing ||
    syncSignal?.syncInProgress ||
    syncStatus.orgsUsersTeams.syncInProgress ||
    syncStatus.jobTemplates.syncInProgress;

  const templateSyncProgress = useMemo((): SyncProgressEntry[] => {
    const getOutcome = (
      syncType: 'orgsUsersTeams' | 'templates',
      status: {
        syncInProgress: boolean;
        lastSyncStatus: 'success' | 'failure' | null;
      },
    ): SyncOutcome => {
      const activeOption =
        syncType === 'orgsUsersTeams' ? 'orgsUsersTeams' : 'templates';
      const isSelected = activeSyncTypes.includes(activeOption);
      const isPending = status.syncInProgress || (localSyncing && isSelected);
      if (isPending) return 'pending';
      if (status.lastSyncStatus === 'failure') return 'failure';
      return 'success';
    };
    const entries: SyncProgressEntry[] = [];
    const showOrgs =
      activeSyncTypes.includes('orgsUsersTeams') ||
      syncStatus.orgsUsersTeams.lastSync !== null ||
      syncStatus.orgsUsersTeams.syncInProgress;
    const showTemplates =
      activeSyncTypes.includes('templates') ||
      syncStatus.jobTemplates.lastSync !== null ||
      syncStatus.jobTemplates.syncInProgress;
    if (showOrgs) {
      const outcome = getOutcome('orgsUsersTeams', syncStatus.orgsUsersTeams);
      entries.push({
        sourceId: 'aap-orgs-users-teams',
        displayName: 'Organizations, Users, and Teams',
        outcome,
        lastSyncTime:
          outcome === 'success'
            ? syncStatus.orgsUsersTeams.lastSync
            : undefined,
      });
    }
    if (showTemplates) {
      const outcome = getOutcome('templates', syncStatus.jobTemplates);
      entries.push({
        sourceId: 'aap-job-templates',
        displayName: 'Job Templates',
        outcome,
        lastSyncTime:
          outcome === 'success' ? syncStatus.jobTemplates.lastSync : undefined,
      });
    }
    return entries;
  }, [activeSyncTypes, syncStatus, localSyncing]);

  const jobTemplatesRef = useRef(jobTemplates);
  jobTemplatesRef.current = jobTemplates;

  const loading = jobTemplatesLoadState === 'loading';

  const fetchSyncStatus = useCallback(async () => {
    try {
      const status = await ansibleApi.getSyncStatus();
      setSyncStatus(prev => ({
        orgsUsersTeams: {
          ...status.aap.orgsUsersTeams,
          lastSyncStatus: prev.orgsUsersTeams.lastSyncStatus,
        },
        jobTemplates: {
          ...status.aap.jobTemplates,
          lastSyncStatus: prev.jobTemplates.lastSyncStatus,
        },
      }));
    } catch {
      // Silently handle sync status fetch errors
      // The dialog will show "Never synced" as fallback
    }
  }, [ansibleApi]);

  const ShowSyncConfirmationDialog = () => {
    fetchSyncStatus();
    setOpen(true);
  };

  const fetchJobTemplates = refreshJobTemplates;

  const handleSync = useCallback(async () => {
    let result = false;
    setLocalSyncing(true);
    setActiveSyncTypes([...syncOptions]);
    try {
      if (syncOptions.includes('orgsUsersTeams')) {
        result = await ansibleApi.syncOrgsUsersTeam();
        if (result) {
          fetchSyncStatus();
        }
      }
      if (syncOptions.includes('templates')) {
        result = await ansibleApi.syncTemplates();
        if (result) {
          fetchSyncStatus();
          // Latest JT set for the logged-in user drives catalog visibility.
          const preSyncTemplates = jobTemplatesRef.current;
          const newTemplates = await fetchJobTemplates({ background: true });
          const listUnchanged =
            newTemplates &&
            !jobTemplateListsDiffer(preSyncTemplates, newTemplates);
          if (listUnchanged) {
            await new Promise(resolve =>
              setTimeout(resolve, JOB_TEMPLATE_LIST_STALE_RETRY_MS),
            );
            // Side effect refreshes JT provider state; return value unused.
            await fetchJobTemplates({ background: true });
          }
          setSyncKey(prev => prev + 1);
          // Soft refresh after JT ids commit (same macrotask defer as SoftRefresh listener).
          window.setTimeout(() => invalidateTemplatesCatalog(), 0);
        }
      }
      setSyncOptions([]);
    } finally {
      setLocalSyncing(false);
    }
  }, [ansibleApi, syncOptions, fetchSyncStatus, fetchJobTemplates]);

  const handleClose = (newSyncOptions?: string[]) => {
    setOpen(false);

    if (newSyncOptions) {
      setSyncOptions(newSyncOptions);
    }
  };

  useEffect(() => {
    if (jobTemplatesErrorMessage) {
      setControllerSnackbar({
        status: 'error',
        message: jobTemplatesErrorMessage,
      });
    }
  }, [jobTemplatesErrorMessage]);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  // After JT load settles: refresh facets + re-query catalog for this JT set.
  useEffect(() => {
    if (loading) return undefined;
    const CATALOG_SETTLE_MS = 750;
    const timerId = setTimeout(() => {
      setSyncKey(prev => prev + 1);
      invalidateTemplatesCatalog();
    }, CATALOG_SETTLE_MS);
    return () => clearTimeout(timerId);
  }, [loading]);

  useEffect(() => {
    if (syncOptions.length > 0) {
      handleSync();
    }
  }, [syncOptions, handleSync]);

  useEffect(() => {
    if (
      activeSyncTypes.length > 0 &&
      !localSyncing &&
      !syncStatus.orgsUsersTeams.syncInProgress &&
      !syncStatus.jobTemplates.syncInProgress
    ) {
      const timerId = setTimeout(() => setActiveSyncTypes([]), 3000);
      return () => clearTimeout(timerId);
    }
    return undefined;
  }, [activeSyncTypes, localSyncing, syncStatus]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'View Templates | Backstage';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  const jobTemplateIds = useMemo(
    () => jobTemplates.map(template => template.id),
    [jobTemplates],
  );
  const jobTemplateIdsKey = useMemo(
    () => jobTemplateIds.join(','),
    [jobTemplateIds],
  );
  const prevJobTemplateIdsKeyRef = useRef<string | null>(null);
  const skipJobTemplateIdsInvalidateRef = useRef(true);

  // Re-query catalog after JT id set commits (post-sync visibility must not race setState).
  useEffect(() => {
    if (jobTemplatesLoadState !== 'ready') {
      return;
    }
    if (skipJobTemplateIdsInvalidateRef.current) {
      skipJobTemplateIdsInvalidateRef.current = false;
      prevJobTemplateIdsKeyRef.current = jobTemplateIdsKey;
      return;
    }
    if (prevJobTemplateIdsKeyRef.current === jobTemplateIdsKey) {
      return;
    }
    prevJobTemplateIdsKeyRef.current = jobTemplateIdsKey;
    invalidateTemplatesCatalog();
  }, [jobTemplateIdsKey, jobTemplatesLoadState]);

  // Remount only when source filters change. JT id updates flow through
  // createHomeCatalogApi + invalidateTemplatesCatalog soft refresh.
  const catalogListKey = selectedSources.join(',') || 'all-sources';

  let catalogContent;
  if (jobTemplatesLoadState === 'ready') {
    catalogContent = (
      <HomeCatalogPanel
        jobTemplateIds={jobTemplateIds}
        selectedSources={selectedSources}
        listKey={catalogListKey}
        syncKey={syncKey}
        externalLoading={loading}
        onSourceChange={setSelectedSources}
      />
    );
  } else if (jobTemplatesLoadState === 'error') {
    catalogContent = (
      <Typography
        variant="body1"
        style={{ textAlign: 'center', padding: '40px 0' }}
      >
        {jobTemplatesErrorMessage ||
          'Could not load your AAP job templates. Try signing in again or use Retry below.'}
        <Button
          color="primary"
          onClick={() => void refreshJobTemplates()}
          style={{ display: 'block', margin: '16px auto 0' }}
        >
          Retry
        </Button>
      </Typography>
    );
  } else {
    catalogContent = <LoadingTemplatesPlaceholder />;
  }

  return (
    <Page themeId="app" className={shellPageClasses.page}>
      {open && (
        <SyncConfirmationDialog
          id="sync-menu"
          keepMounted
          open={open}
          onClose={handleClose}
          value={syncOptions}
          syncStatus={syncStatus}
        />
      )}
      <Content>
        <TemplatesPageHeaderSection
          onSyncClick={ShowSyncConfirmationDialog}
          syncDisabled={isSyncInProgress}
          syncDisabledReason={
            isSyncInProgress ? 'Sync in progress...' : undefined
          }
          syncInProgress={isSyncInProgress}
          syncProgress={templateSyncProgress}
          lastSyncTimes={[
            {
              label: 'Organizations, Users, and Teams',
              time: syncStatus.orgsUsersTeams.lastSync,
            },
            { label: 'Job Templates', time: syncStatus.jobTemplates.lastSync },
          ]}
          actions={
            showAddTemplate ? (
              <Tooltip
                title={addTemplateDisabled ? 'Checking permissions...' : ''}
              >
                <span>
                  <Button
                    data-testid="add-template-button"
                    onClick={() => navigate(`${rootLink()}/catalog-import`)}
                    variant="contained"
                    color="primary"
                    disabled={addTemplateDisabled}
                  >
                    Add Template
                  </Button>
                </span>
              </Tooltip>
            ) : undefined
          }
        />
        <Snackbar
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          open={controllerSnackbar.status === 'error'}
          style={{ zIndex: 10000 }}
          TransitionProps={{ exit: false }}
        >
          <Alert
            severity="error"
            onClose={() => setControllerSnackbar({ status: 'idle' })}
          >
            {controllerSnackbar.status === 'error' &&
              controllerSnackbar.message}
          </Alert>
        </Snackbar>
        {catalogContent}
      </Content>
    </Page>
  );
};

const TemplatesRoutesContent = () => {
  const { notifications, removeNotification } = useNotifications();

  return (
    <>
      <Routes>
        <Route path="catalog" element={<HomeComponent />} />
        <Route
          path="catalog/:namespace/:templateName"
          element={<CatalogItemsDetails />}
        />
        <Route
          path="create/templates/:namespace/:templateName"
          element={<CreateTask />}
        />
        <Route path="*" element={<Navigate to="catalog" replace />} />
      </Routes>
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
};

/**
 * Standalone route wrapper used by the dynamic plugin mount at /self-service.
 * Handles all routes gated by ansible.templates.view:
 *   /self-service/catalog                                    — template catalog
 *   /self-service/catalog/:namespace/:templateName            — template detail
 *   /self-service/create/templates/:namespace/:templateName   — run template
 */
export const TemplatesRoutesPage = () => {
  return (
    <RequirePermission permission={templatesViewPermission}>
      <NotificationProvider>
        <JobTemplatesProvider>
          <TemplatesRoutesContent />
        </JobTemplatesProvider>
      </NotificationProvider>
    </RequirePermission>
  );
};
