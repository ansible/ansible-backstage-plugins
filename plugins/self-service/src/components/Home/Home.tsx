import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useSignal } from '@backstage/plugin-signals-react';
import { useNavigate } from 'react-router';
import { Route, Routes, Navigate } from 'react-router-dom';
import { Button, Snackbar, Tooltip, Typography } from '@material-ui/core';
import { Content, ItemCardGrid, Page } from '@backstage/core-components';
import { ApiProvider } from '@backstage/core-app-api';
import { useApi, useApiHolder, useRouteRef } from '@backstage/core-plugin-api';
import {
  usePermission,
  RequirePermission,
} from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import {
  catalogApiRef,
  CatalogFilterLayout,
  EntityKindPicker,
  EntityListProvider,
  EntityOwnerPicker,
  EntitySearchBar,
  EntityTagFilter,
  EntityTypeFilter,
  UserListPicker,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import { templatesViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import { WizardCard } from './TemplateCard';
import { useIsSuperuser } from '../../hooks';
import { rootRouteRef } from '../../routes';
import { ansibleApiRef } from '../../apis';
import { SyncConfirmationDialog } from './SyncConfirmationDialog';
import { TemplatesPageHeaderSection } from './TemplatesPageHeaderSection';
import type { SyncProgressEntry, SyncOutcome } from '../common';
import { useShellPageStyles } from '../common';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import Alert from '@material-ui/lab/Alert';
import { SkeletonLoader } from './SkeletonLoader';
import { TagFilterPicker } from '../utils/TagFilterPicker';
import { SourcePicker } from '../utils/SourcePicker';
import { CatalogItemsDetails } from '../CatalogItemDetails';
import { CreateTask } from '../CreateTask';
import { PAGE_SIZE, resolvePageLimit } from './constants';
import { createHomeCatalogApi } from './createHomeCatalogApi';
import { createOverridingApiHolder } from './createOverridingApiHolder';
import { TemplatesPagination } from './TemplatesPagination';
import { useJobTemplates } from './JobTemplatesProvider';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '../notifications';
import { JobTemplatesProvider } from './JobTemplatesProvider';

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

const isEEType = (type: string) => type.includes('execution-environment');

const HomeCatalogProvider = ({
  children,
  jobTemplateIds,
  selectedSources,
  listKey,
}: {
  children: React.ReactNode;
  jobTemplateIds: number[];
  selectedSources: string[];
  listKey: string;
}) => {
  const parentApis = useApiHolder();
  const catalogApi = useApi(catalogApiRef);
  const homeCatalogApi = useMemo(
    () => createHomeCatalogApi(catalogApi, jobTemplateIds, selectedSources),
    [catalogApi, jobTemplateIds, selectedSources],
  );
  const apis = useMemo(
    () =>
      createOverridingApiHolder(parentApis, [[catalogApiRef, homeCatalogApi]]),
    [parentApis, homeCatalogApi],
  );

  return (
    <ApiProvider apis={apis}>
      <EntityListProvider
        key={listKey}
        pagination={{ mode: 'offset', limit: PAGE_SIZE }}
      >
        {children}
      </EntityListProvider>
    </ApiProvider>
  );
};

const HomeTagPicker = ({ syncKey }: { syncKey: number }) => {
  const catalogApi = useApi(catalogApiRef);
  const { filters, updateFilters } = useEntityList();
  const selectedTags = (filters.tags as EntityTagFilter)?.values ?? [];
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    catalogApi
      .getEntityFacets({
        filter: { kind: 'Template' },
        facets: ['spec.type'],
      })
      .then(
        (response: { facets: Record<string, Array<{ value: string }>> }) => {
          const nonEETypes = (response.facets['spec.type'] ?? [])
            .map(f => f.value)
            .filter(t => !isEEType(t));
          return catalogApi.getEntityFacets({
            filter: {
              kind: 'Template',
              ...(nonEETypes.length > 0 && { 'spec.type': nonEETypes }),
            },
            facets: ['metadata.tags'],
          });
        },
      )
      .then(
        (response: { facets: Record<string, Array<{ value: string }>> }) => {
          const tags = (response.facets['metadata.tags'] ?? [])
            .map(f => f.value)
            .sort((a, b) => a.localeCompare(b));
          setAvailableTags(tags);
        },
      )
      .catch(() => {
        setAvailableTags([]);
      });
  }, [catalogApi, syncKey]);

  const handleTagChange = (newValue: string[]) => {
    updateFilters({
      tags: newValue.length > 0 ? new EntityTagFilter(newValue) : undefined,
    });
  };

  return (
    <TagFilterPicker
      label="Tags"
      options={availableTags}
      value={selectedTags}
      onChange={handleTagChange}
      noOptionsText="No tags available"
    />
  );
};

const HomeCategoryPicker = ({ syncKey }: { syncKey: number }) => {
  const catalogApi = useApi(catalogApiRef);
  const { filters, updateFilters } = useEntityList();
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [userSelection, setUserSelection] = useState<string[]>([]);

  useEffect(() => {
    catalogApi
      .getEntityFacets({
        filter: { kind: 'Template' },
        facets: ['spec.type'],
      })
      .then(
        (response: { facets: Record<string, Array<{ value: string }>> }) => {
          const types = (response.facets['spec.type'] ?? []).map(f => f.value);
          const nonEE = types.filter(t => !isEEType(t));
          const sorted = [...nonEE].sort((a, b) => a.localeCompare(b));
          setAllCategories(sorted);
          if (!filters.type || filters.type.getTypes().length === 0) {
            updateFilters({
              type: nonEE.length > 0 ? new EntityTypeFilter(nonEE) : undefined,
            });
          }
        },
      )
      .catch(() => {
        setAllCategories([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogApi, syncKey]);

  const handleCategoryChange = (newValue: string[]) => {
    setUserSelection(newValue);
    const typesToFilter = newValue.length > 0 ? newValue : allCategories;
    updateFilters({
      type:
        typesToFilter.length > 0
          ? new EntityTypeFilter(typesToFilter)
          : undefined,
    });
  };

  return (
    <TagFilterPicker
      label="Categories"
      options={allCategories}
      value={userSelection}
      onChange={handleCategoryChange}
      noOptionsText="No categories available"
    />
  );
};

const TemplateContent = ({
  loading: externalLoading,
}: {
  loading: boolean;
}) => {
  const {
    entities,
    loading: catalogLoading,
    totalItems,
    limit,
    offset,
    setOffset,
    setLimit,
  } = useEntityList();

  const isLoading = externalLoading || catalogLoading;
  const pageLimit = resolvePageLimit(limit);

  useEffect(() => {
    if (limit !== undefined && limit !== pageLimit) {
      setOffset?.(0);
      setLimit?.(pageLimit);
    }
  }, [limit, pageLimit, setLimit, setOffset]);

  const page = offset ? Math.floor(offset / pageLimit) : 0;
  const totalCount = totalItems ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageLimit));
  const startIndex = totalCount === 0 ? 0 : page * pageLimit + 1;
  const endIndex = Math.min(totalCount, (page + 1) * pageLimit);

  const visibleEntities = useMemo(
    () =>
      (entities as TemplateEntityV1beta3[]).filter(
        entity => !entity.spec?.type?.includes('execution-environment'),
      ),
    [entities],
  );

  if (isLoading) {
    return (
      <div
        data-testid="loading-templates"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          gap: '10px',
        }}
      >
        {[1, 2, 3].map(id => (
          <SkeletonLoader key={`skeleton-${id}`} />
        ))}
      </div>
    );
  }

  return (
    <div data-testid="templates-container">
      {totalCount === 0 && !isLoading ? (
        <Typography
          variant="body1"
          style={{ textAlign: 'center', padding: '40px 0', opacity: 0.6 }}
        >
          No templates found.
        </Typography>
      ) : (
        <>
          <ItemCardGrid>
            {visibleEntities.map(template => (
              <WizardCard key={template.metadata.uid} template={template} />
            ))}
          </ItemCardGrid>
          <TemplatesPagination
            totalCount={totalCount}
            pageLimit={pageLimit}
            page={page}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={nextOffset => setOffset?.(nextOffset)}
            onPageSizeChange={nextLimit => {
              setOffset?.(0);
              setLimit?.(nextLimit);
            }}
          />
        </>
      )}
    </div>
  );
};

export const HomeComponent = () => {
  const navigate = useNavigate();
  const shellPageClasses = useShellPageStyles();
  const rootLink = useRouteRef(rootRouteRef);
  const ansibleApi = useApi(ansibleApiRef);
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
  const { lastSignal: syncSignal } = useSignal<{
    provider: string;
    syncInProgress: boolean;
    lastSyncTime: string | null;
    lastSyncStatus: 'success' | 'failure' | null;
    lastFailedSyncTime: string | null;
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
  }, [syncSignal]);

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
          const preSyncTemplates = jobTemplatesRef.current;
          const newTemplates = await fetchJobTemplates({ background: true });
          const listUnchanged =
            newTemplates &&
            !jobTemplateListsDiffer(preSyncTemplates, newTemplates);
          if (listUnchanged) {
            await new Promise(resolve =>
              setTimeout(resolve, JOB_TEMPLATE_LIST_STALE_RETRY_MS),
            );
            await fetchJobTemplates({ background: true });
          }
          setSyncKey(prev => prev + 1);
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

  // After fetchJobTemplates completes, schedule a catalog refresh so that
  // recently imported templates (via "Add Template") have time to be
  // processed by the catalog backend before we re-query.
  useEffect(() => {
    if (loading) return undefined;
    const CATALOG_SETTLE_MS = 750;
    const timerId = setTimeout(() => {
      setSyncKey(prev => prev + 1);
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
  const catalogListKey = `${syncKey}-${jobTemplateIds.join(',')}-${selectedSources.join(',')}`;
  const canShowCatalog = jobTemplatesLoadState === 'ready';

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
        {canShowCatalog ? (
          <HomeCatalogProvider
            jobTemplateIds={jobTemplateIds}
            selectedSources={selectedSources}
            listKey={catalogListKey}
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
                  onSourceChange={setSelectedSources}
                />
                <EntityOwnerPicker />
              </CatalogFilterLayout.Filters>
              <CatalogFilterLayout.Content>
                <TemplateContent loading={loading} />
              </CatalogFilterLayout.Content>
            </CatalogFilterLayout>
          </HomeCatalogProvider>
        ) : jobTemplatesLoadState === 'error' ? (
          <Typography
            variant="body1"
            style={{ textAlign: 'center', padding: '40px 0' }}
          >
            {jobTemplatesErrorMessage ??
              'Could not load your AAP job templates. Try signing in again or use Retry below.'}
            <Button
              color="primary"
              onClick={() => void refreshJobTemplates()}
              style={{ display: 'block', margin: '16px auto 0' }}
            >
              Retry
            </Button>
          </Typography>
        ) : (
          <div
            data-testid="loading-templates"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              gap: '10px',
            }}
          >
            {[1, 2, 3].map(id => (
              <SkeletonLoader key={`skeleton-${id}`} />
            ))}
          </div>
        )}
      </Content>
    </Page>
  );
};

// Inner content component that uses the notification context
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
