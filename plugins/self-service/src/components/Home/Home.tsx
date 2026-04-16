import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  makeStyles,
  Snackbar,
  Tooltip,
  Typography,
} from '@material-ui/core';
import { Content, Header, HeaderLabel, Page } from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
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
import { TemplateGroups } from '@backstage/plugin-scaffolder-react/alpha';

import { WizardCard } from './TemplateCard';
import { useIsSuperuser } from '../../hooks';
import { rootRouteRef } from '../../routes';
import { ansibleApiRef, rhAapAuthApiRef } from '../../apis';
import { SyncConfirmationDialog } from './SyncConfirmationDialog';
import Sync from '@material-ui/icons/Sync';
import Info from '@material-ui/icons/Info';
import OpenInNew from '@material-ui/icons/OpenInNew';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { SkeletonLoader } from './SkeletonLoader';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { TagFilterPicker } from '../utils/TagFilterPicker';

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

const HomeTagPicker = ({
  jobTemplates,
}: {
  jobTemplates: { id: number; name: string }[];
}) => {
  const { backendEntities, filters, updateFilters } = useEntityList();
  const selectedTags = (filters.tags as EntityTagFilter)?.values ?? [];

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const entity of backendEntities) {
      const templateEntity = entity as TemplateEntityV1beta3;
      if (isHomePageTemplate(templateEntity, jobTemplates)) {
        for (const tag of entity.metadata?.tags || []) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [backendEntities, jobTemplates]);

  const handleTagChange = (newValue: string[]) => {
    updateFilters({
      ...filters,
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

const HomeCategoryPicker = ({
  jobTemplates,
}: {
  jobTemplates: { id: number; name: string }[];
}) => {
  const { backendEntities, filters, updateFilters } = useEntityList();
  const [allCategories, setAllCategories] = useState<string[]>([]);

  const selectedCategories =
    (filters.type as EntityTypeFilter)?.getTypes() ?? [];

  useEffect(() => {
    const categorySet = new Set<string>(allCategories);
    for (const entity of backendEntities) {
      const templateEntity = entity as TemplateEntityV1beta3;
      if (isHomePageTemplate(templateEntity, jobTemplates)) {
        const type = templateEntity.spec?.type;
        if (type) {
          categorySet.add(type);
        }
      }
    }
    const newCategories = Array.from(categorySet).sort((a, b) =>
      a.localeCompare(b),
    );
    if (newCategories.length !== allCategories.length) {
      setAllCategories(newCategories);
    }
  }, [backendEntities, jobTemplates, allCategories]);

  const handleCategoryChange = (newValue: string[]) => {
    updateFilters({
      ...filters,
      type: newValue.length > 0 ? new EntityTypeFilter(newValue) : undefined,
    });
  };

  return (
    <TagFilterPicker
      label="Categories"
      options={allCategories}
      value={selectedCategories}
      onChange={handleCategoryChange}
      noOptionsText="No categories available"
    />
  );
};

export const HomeComponent = () => {
  const classes = headerStyles();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  const ansibleApi = useApi(ansibleApiRef);
  const rhAapAuthApi = useApi(rhAapAuthApiRef);
  const scaffolderApi = useApi(scaffolderApiRef);
  const { isSuperuser: allowed } = useIsSuperuser();
  const [open, setOpen] = useState(false);
  const [syncOptions, setSyncOptions] = useState<string[]>([]);
  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);
  const [snackbarMsg, setSnackbarMsg] = useState<string>('Sync failed');
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
      const newTemplates = results.map(result => ({
        id: parseInt(result.id, 10),
        name: result.title as string,
      }));
      if (requestId === fetchRequestIdRef.current) {
        setJobTemplates(newTemplates);
      }
      return newTemplates;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch job templates:', error);
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
      setSnackbarMsg('Templates refreshed');
      setShowSnackbar(true);
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
              href="https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_self-service_automation_portal/self-service-working-templates_aap-self-service-using#self-service-launch-template_self-service-working-templates"
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
            {allowed && (
              <HeaderLabel
                label=""
                value={
                  <Typography
                    component="a"
                    onClick={ShowSyncConfirmationDialog}
                    style={{ cursor: 'pointer', color: 'inherit' }}
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
                        <Info fontSize="small" style={{ marginLeft: '4px' }} />
                      </Tooltip>
                    </span>
                  </Typography>
                }
                contentTypograpyRootComponent="span"
              />
            )}
          </>
        }
        style={{ background: 'inherit' }}
      >
        {allowed && (
          <Button
            data-testid="add-template-button"
            onClick={() => navigate(`${rootLink()}/catalog-import`)}
            variant="contained"
          >
            Add Template
          </Button>
        )}
      </Header>
      <Content>
        <EntityListProvider key={syncKey}>
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
                <HomeCategoryPicker jobTemplates={jobTemplates} />
              </div>
              <HomeTagPicker jobTemplates={jobTemplates} />
              <EntityOwnerPicker />
            </CatalogFilterLayout.Filters>
            <CatalogFilterLayout.Content>
              {loading ? (
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
                  {Array.from({ length: 3 }).map((_, index) => (
                    <SkeletonLoader key={`skeleton-${index}`} />
                  ))}
                </div>
              ) : (
                <div data-testid="templates-container">
                  <TemplateGroups
                    groups={[
                      {
                        filter: (entity: TemplateEntityV1beta3) =>
                          isHomePageTemplate(entity, jobTemplates),
                      },
                    ]}
                    TemplateCardComponent={WizardCard}
                  />
                </div>
              )}
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
