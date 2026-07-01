import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Route, Routes, Navigate } from 'react-router-dom';
import {
  Box,
  Button,
  IconButton,
  makeStyles,
  Snackbar,
  Tooltip,
  Typography,
} from '@material-ui/core';
import NavigateBeforeIcon from '@material-ui/icons/NavigateBefore';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';
import {
  Content,
  Header,
  HeaderLabel,
  ItemCardGrid,
  Page,
} from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
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
import { PAGE_SIZE } from './constants';

import { WizardCard } from './TemplateCard';
import { useIsSuperuser } from '../../hooks';
import { rootRouteRef } from '../../routes';
import { ansibleApiRef, rhAapAuthApiRef } from '../../apis';
import { SyncConfirmationDialog } from './SyncConfirmationDialog';
import Sync from '@material-ui/icons/Sync';
import Info from '@material-ui/icons/Info';
import OpenInNew from '@material-ui/icons/OpenInNew';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import Alert from '@material-ui/lab/Alert';
import { SkeletonLoader } from './SkeletonLoader';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { TagFilterPicker } from '../utils/TagFilterPicker';
import { CatalogItemsDetails } from '../CatalogItemDetails';
import { CreateTask } from '../CreateTask';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '../notifications';

const headerStyles = makeStyles(theme => ({
  header_title_color: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
  },
  header_subtitle: {
    display: 'inline-block',
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    opacity: 0.8,
    maxWidth: '75ch',
    marginTop: '8px',
    fontWeight: 500,
    lineHeight: 1.57,
  },
  paginationContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing(2),
    padding: theme.spacing(0, 1),
  },
  paginationInfo: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
}));

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

const isHomePageTemplate = (
  entity: TemplateEntityV1beta3,
  jobTemplates: { id: number; name: string }[],
): boolean => {
  if (entity.spec?.type?.includes('execution-environment')) {
    return false;
  }
  if (!entity.metadata.aapJobTemplateId) {
    return true;
  }
  return jobTemplates.some(({ id }) => id === entity.metadata.aapJobTemplateId);
};

const isEEType = (type: string) => type.includes('execution-environment');

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
  jobTemplates,
}: {
  loading: boolean;
  jobTemplates: { id: number; name: string }[];
}) => {
  const classes = headerStyles();
  const {
    entities,
    loading: catalogLoading,
    pageInfo,
    limit,
  } = useEntityList();
  const [currentPage, setCurrentPage] = useState(1);
  const [nonAapCount, setNonAapCount] = useState(0);
  const nonAapCounted = useRef(false);

  useEffect(() => {
    if (!pageInfo?.prev) {
      setCurrentPage(1);
    }
  }, [pageInfo?.prev]);

  const isLoading = externalLoading || catalogLoading;

  useEffect(() => {
    if (!nonAapCounted.current && !isLoading && entities.length > 0) {
      const count = (entities as TemplateEntityV1beta3[]).filter(
        entity =>
          !entity.spec?.type?.includes('execution-environment') &&
          !entity.metadata.aapJobTemplateId,
      ).length;
      setNonAapCount(count);
      nonAapCounted.current = true;
    }
  }, [entities, isLoading]);

  const filteredEntities = useMemo(
    () =>
      (entities as TemplateEntityV1beta3[]).filter(entity =>
        isHomePageTemplate(entity, jobTemplates),
      ),
    [entities, jobTemplates],
  );

  const displayCount = filteredEntities.length;
  const totalCount = jobTemplates.length + nonAapCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const showStart = displayCount > 0 ? (currentPage - 1) * limit + 1 : 0;
  const showEnd = (currentPage - 1) * limit + displayCount;

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
      {displayCount === 0 && !isLoading ? (
        <Typography
          variant="body1"
          style={{ textAlign: 'center', padding: '40px 0', opacity: 0.6 }}
        >
          No templates found. Please contact your administrator.
        </Typography>
      ) : (
        <ItemCardGrid>
          {filteredEntities.map(template => (
            <WizardCard key={template.metadata.uid} template={template} />
          ))}
        </ItemCardGrid>
      )}
      {displayCount > 0 && (
        <Box className={classes.paginationContainer}>
          <Typography className={classes.paginationInfo}>
            Showing {showStart}-{showEnd} of {totalCount} templates
          </Typography>
          {totalPages > 1 && (
            <Box className={classes.paginationControls}>
              <IconButton
                size="small"
                disabled={!pageInfo?.prev}
                onClick={() => {
                  pageInfo?.prev?.();
                  setCurrentPage(p => Math.max(1, p - 1));
                }}
                aria-label="Previous page"
              >
                <NavigateBeforeIcon />
              </IconButton>
              <Typography variant="body2">
                Page {currentPage} of {totalPages}
              </Typography>
              <IconButton
                size="small"
                disabled={!pageInfo?.next}
                onClick={() => {
                  pageInfo?.next?.();
                  setCurrentPage(p => p + 1);
                }}
                aria-label="Next page"
              >
                <NavigateNextIcon />
              </IconButton>
            </Box>
          )}
        </Box>
      )}
    </div>
  );
};

export const HomeComponent = () => {
  const classes = headerStyles();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  const ansibleApi = useApi(ansibleApiRef);
  const rhAapAuthApi = useApi(rhAapAuthApiRef);
  const scaffolderApi = useApi(scaffolderApiRef);
  const { isSuperuser, loading: checkingSuperuser } = useIsSuperuser();
  const showSyncControls = checkingSuperuser || isSuperuser;
  const syncControlsDisabled = checkingSuperuser;

  const { loading: checkingCatalogCreate, allowed: canCreateCatalogEntity } =
    usePermission({ permission: catalogEntityCreatePermission });
  const checkingAddTemplate = checkingSuperuser || checkingCatalogCreate;
  const showAddTemplate = checkingSuperuser
    ? true
    : isSuperuser && (checkingCatalogCreate || canCreateCatalogEntity);
  const addTemplateDisabled = checkingAddTemplate;
  const [open, setOpen] = useState(false);
  const [syncOptions, setSyncOptions] = useState<string[]>([]);
  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);
  const [snackbarMsg, setSnackbarMsg] = useState<string>('Sync failed');
  const [controllerSnackbar, setControllerSnackbar] = useState<
    { status: 'idle' } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [jobTemplates, setJobTemplates] = useState<
    { id: number; name: string }[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncKey, setSyncKey] = useState(0);
  const [syncStatus, setSyncStatus] = useState<{
    orgsUsersTeams: { lastSync: string | null };
    jobTemplates: { lastSync: string | null };
  }>({
    orgsUsersTeams: { lastSync: null },
    jobTemplates: { lastSync: null },
  });

  const fetchRequestIdRef = useRef(0);
  const fetchSucceededRef = useRef(false);
  const jobTemplatesRef = useRef(jobTemplates);
  jobTemplatesRef.current = jobTemplates;

  const fetchSyncStatus = useCallback(async () => {
    try {
      const status = await ansibleApi.getSyncStatus();
      setSyncStatus(status.aap);
    } catch {
      // Silently handle sync status fetch errors
      // The dialog will show "Never synced" as fallback
    }
  }, [ansibleApi]);

  const ShowSyncConfirmationDialog = () => {
    fetchSyncStatus();
    setOpen(true);
  };

  const fetchJobTemplates = useCallback(async (): Promise<
    { id: number; name: string }[] | undefined
  > => {
    const requestId = ++fetchRequestIdRef.current;
    try {
      const token = await rhAapAuthApi.getAccessToken();
      if (!scaffolderApi.autocomplete) {
        return undefined;
      }
      const { results } = await scaffolderApi.autocomplete({
        token,
        resource: 'job_templates',
        provider: 'aap-api-cloud',
        context: {},
      });
      const newTemplates = results.map(
        (result: { id: string; title?: string }) => ({
          id: Number.parseInt(result.id, 10),
          name: result.title ?? result.id,
        }),
      );
      if (requestId === fetchRequestIdRef.current) {
        setJobTemplates(newTemplates);
        fetchSucceededRef.current = true;
      }
      return newTemplates;
    } catch (error) {
      const message =
        (error as any)?.body?.error?.message ??
        (error instanceof Error ? error.message : String(error));
      // eslint-disable-next-line no-console
      console.error('Failed to fetch job templates:', error);
      setControllerSnackbar({ status: 'error', message });
      if (requestId === fetchRequestIdRef.current) {
        fetchSucceededRef.current = false;
      }
      return undefined;
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [scaffolderApi, rhAapAuthApi]);

  const handleSync = useCallback(async () => {
    let result = false;
    setSnackbarMsg('Starting sync...');
    setShowSnackbar(true);
    if (syncOptions.includes('orgsUsersTeams')) {
      result = await ansibleApi.syncOrgsUsersTeam();
      if (result) {
        setSnackbarMsg('Organizations, Users and Teams synced successfully');
        fetchSyncStatus();
      } else {
        setSnackbarMsg('Organizations, Users and Teams sync failed');
      }
      setShowSnackbar(true);
    }
    if (syncOptions.includes('templates')) {
      result = await ansibleApi.syncTemplates();
      setShowSnackbar(false);
      if (result) {
        fetchSyncStatus();
        setSnackbarMsg('Fetching updated templates...');
        setShowSnackbar(true);
        const preSyncTemplates = jobTemplatesRef.current;
        let newTemplates = await fetchJobTemplates();
        // delayed re-fetch to aligns the allow-list with the provider
        const listUnchanged =
          newTemplates &&
          !jobTemplateListsDiffer(preSyncTemplates, newTemplates);
        if (listUnchanged) {
          await new Promise(resolve =>
            setTimeout(resolve, JOB_TEMPLATE_LIST_STALE_RETRY_MS),
          );
          newTemplates = await fetchJobTemplates();
        }
        setSyncKey(prev => prev + 1);
        setSnackbarMsg(
          newTemplates
            ? 'Templates synced successfully'
            : 'Templates synced, but refreshing the list failed. Please reload the page.',
        );
      } else {
        setSnackbarMsg('Templates sync failed');
      }
      setShowSnackbar(true);
    }
    setSyncOptions([]);
  }, [ansibleApi, syncOptions, fetchSyncStatus, fetchJobTemplates]);

  const handleClose = (newSyncOptions?: string[]) => {
    setOpen(false);

    if (newSyncOptions) {
      setSyncOptions(newSyncOptions);
    }
  };

  useEffect(() => {
    fetchJobTemplates();
  }, [fetchJobTemplates]);

  // After fetchJobTemplates completes, schedule a catalog refresh so that
  // recently imported templates (via "Add Template") have time to be
  // processed by the catalog backend before we re-query.
  useEffect(() => {
    if (loading) return undefined;
    const CATALOG_SETTLE_MS = 750;
    const timerId = setTimeout(() => {
      setSyncKey(prev => prev + 1);
      if (fetchSucceededRef.current) {
        setSnackbarMsg('Templates refreshed');
        setShowSnackbar(true);
      }
    }, CATALOG_SETTLE_MS);
    return () => clearTimeout(timerId);
  }, [loading]);

  useEffect(() => {
    if (syncOptions.length > 0) {
      handleSync();
    }
  }, [syncOptions, handleSync]);

  return (
    <Page themeId="app">
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
      <Header
        pageTitleOverride="View Templates"
        title={<span className={classes.header_title_color}>Templates</span>}
        subtitle={
          <>
            <div>
              <span className={classes.header_subtitle}>
                Browse available templates. Each template provides a guided
                experience to get your automation running. Select "Start" to
                begin the guided task.
              </span>
            </div>
            <Typography
              component="a"
              href="https://red.ht/self-service-launch-template"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                cursor: 'pointer',
                color: 'inherit',
                textDecoration: 'underline',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '8px',
                opacity: 0.8,
              }}
            >
              Learn more <OpenInNew fontSize="small" />
            </Typography>
            {showSyncControls && (
              <HeaderLabel
                label=""
                value={
                  <Tooltip
                    title={
                      syncControlsDisabled ? 'Checking permissions...' : ''
                    }
                  >
                    <Typography
                      component="a"
                      onClick={
                        syncControlsDisabled
                          ? undefined
                          : ShowSyncConfirmationDialog
                      }
                      style={{
                        cursor: syncControlsDisabled ? 'default' : 'pointer',
                        color: 'inherit',
                        opacity: syncControlsDisabled ? 0.5 : 1,
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          textDecoration: 'underline',
                        }}
                      >
                        Sync now <Sync fontSize="small" />
                        <Tooltip title="Sync AAP Job Templates, Organizations, Users, and Teams from AAP to automation portal.">
                          <Info
                            fontSize="small"
                            style={{ marginLeft: '4px' }}
                          />
                        </Tooltip>
                      </span>
                    </Typography>
                  </Tooltip>
                }
                contentTypograpyRootComponent="span"
              />
            )}
          </>
        }
        style={{ background: 'inherit' }}
      >
        {showAddTemplate && (
          <Tooltip title={addTemplateDisabled ? 'Checking permissions...' : ''}>
            <span>
              <Button
                data-testid="add-template-button"
                onClick={() => navigate(`${rootLink()}/catalog-import`)}
                variant="contained"
                disabled={addTemplateDisabled}
              >
                Add Template
              </Button>
            </span>
          </Tooltip>
        )}
      </Header>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={controllerSnackbar.status === 'error'}
        style={{ zIndex: 10000, marginTop: '70px' }}
        TransitionProps={{ exit: false }}
      >
        <Alert
          severity="error"
          onClose={() => setControllerSnackbar({ status: 'idle' })}
        >
          {controllerSnackbar.status === 'error' && controllerSnackbar.message}
        </Alert>
      </Snackbar>
      <Content>
        <EntityListProvider
          key={syncKey}
          pagination={{ mode: 'cursor', limit: PAGE_SIZE }}
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
              <EntityOwnerPicker />
            </CatalogFilterLayout.Filters>
            <CatalogFilterLayout.Content>
              <TemplateContent loading={loading} jobTemplates={jobTemplates} />
            </CatalogFilterLayout.Content>
          </CatalogFilterLayout>
        </EntityListProvider>
      </Content>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={showSnackbar}
        onClose={() => setShowSnackbar(false)}
        autoHideDuration={3000}
        message={snackbarMsg}
        style={{ zIndex: 10000, marginTop: '70px' }}
      />
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
        <TemplatesRoutesContent />
      </NotificationProvider>
    </RequirePermission>
  );
};
