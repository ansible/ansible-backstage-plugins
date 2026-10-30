import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  Fragment,
} from 'react';
import {
  NativeCatalogHeaderActions,
  useNativeCatalogTabs,
} from '@ansible/portal-extension-host/alpha';
import { portalContributionsApiRef } from '@ansible/portal-extension-api/alpha';
import {
  Page,
  Content,
  HeaderTabs,
  LinkButton,
} from '@backstage/core-components';
import { Box, Button, makeStyles } from '@material-ui/core';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import CategoryOutlinedIcon from '@material-ui/icons/CategoryOutlined';
import TimelineIcon from '@material-ui/icons/Timeline';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import {
  useApi,
  useApiHolder,
  useRouteRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import {
  useExtensionTabs,
  useExtensionActions,
  EXTENSION_POINTS,
  CONTENT_TYPES,
} from '@ansible/portal-extension-api';
import { useSyncStatusPolling } from '../../hooks';
import { SyncDialog } from '../common';
import type { SyncStatusMap, StartedSyncInfo } from '../common';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '../notifications';
import { ExtensionTabContent } from '../../extensions/ExtensionRenderer';

import { rootRouteRef } from '../../routes';
import { RepositoriesPageHeaderSection } from './RepositoriesPageHeaderSection';
import { RepositoriesTable } from './RepositoriesTable';
import { RepositoriesCIActivityTab } from './RepositoriesCIActivityTab';
import { RepositoryDetailsPage } from './RepositoryDetailsPage';
import { gitReposCache } from './gitReposCache';

const useStyles = makeStyles(theme => ({
  tabsSection: {
    width: '100%',
    '& .MuiTabs-root': {
      overflow: 'visible',
    },
    '& .MuiTabs-indicator': {
      width: '100vw',
      left: '50% !important',
      marginLeft: '-50vw',
    },
    '& .MuiTab-root': {
      minWidth: 260,
      padding: theme.spacing(2, 5),
      fontSize: 16,
    },
  },
  tabWithIcon: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  tabContent: {
    paddingTop: theme.spacing(3),
  },
}));

const tabs = [
  { id: 0, label: 'Catalog', icon: <CategoryOutlinedIcon />, path: 'catalog' },
  { id: 1, label: 'CI Activity', icon: <TimelineIcon />, path: 'ci-activity' },
];

/** Number of hardcoded built-in tabs. Extension tabs occupy indices ≥ this. */
const GIT_REPO_BUILT_IN_TABS = tabs.length;

const getTabIndexFromPath = (pathname: string): number => {
  if (pathname.includes('/repositories/ci-activity')) return 1;
  return 0;
};

/** Render the filtered repository catalog with host contributions and permission-gated actions. */
export const GitRepositoriesPage = () => {
  const classes = useStyles();
  const location = useLocation();
  const navigate = useNavigate();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const { isSyncInProgress, syncProgress, startTracking } =
    useSyncStatusPolling();

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const { showNotification } = useNotifications();
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const [syncStatusMap, setSyncStatusMap] = useState<SyncStatusMap>({});
  const prevSyncInProgressRef = useRef(false);

  const selectedTab = getTabIndexFromPath(location.pathname);

  // Extension tabs for the list view. Community plugins register contributions
  // at EXTENSION_POINTS.GIT_REPO_LIST_TABS; they appear after the built-in tabs.
  const legacyExtensionTabs = useExtensionTabs(
    EXTENSION_POINTS.GIT_REPO_LIST_TABS,
    undefined,
    CONTENT_TYPES.PLAYBOOK_REPOSITORY,
  );

  // Extension actions for the list page header (e.g. "Add repository" from APME).
  const listActions = useExtensionActions(
    EXTENSION_POINTS.GIT_REPO_LIST_ACTIONS,
  );
  const nativeContributions = useApiHolder().get(portalContributionsApiRef);
  const [searchParams, setSearchParams] = useSearchParams();
  const catalogContext = useMemo(
    () => ({
      contentType: CONTENT_TYPES.PLAYBOOK_REPOSITORY,
      entityDetailPath: (
        name: string,
        entryPointId?: string,
        filters?: Record<string, string>,
      ) => {
        const params = new URLSearchParams(filters);
        if (entryPointId) params.set('tab', entryPointId);
        const query = params.toString();
        return `${rootLink()}/repositories/${encodeURIComponent(name)}${
          query ? `?${query}` : ''
        }`;
      },
    }),
    [rootLink],
  );
  const nativeTabs = useNativeCatalogTabs(catalogContext);
  const extensionTabs = nativeTabs ?? legacyExtensionTabs;

  // Tracks which extension tab (0-based into extensionTabs) is active.
  // null = a built-in tab is active (URL-driven); number = extension tab active.
  const [activeExtTabIndex, setActiveExtTabIndex] = useState<number | null>(
    null,
  );

  // Reset extension tab selection whenever the URL-driven built-in tab changes
  // (e.g. browser back/forward, sidebar navigation).
  useEffect(() => {
    if (!nativeContributions) return;
    const id = searchParams.get('catalogTab');
    const index = id ? extensionTabs.findIndex(item => item.id === id) : -1;
    setActiveExtTabIndex(index >= 0 ? index : null);
  }, [location.pathname, searchParams, nativeContributions, extensionTabs]);
  useEffect(() => {
    if (!nativeContributions) setActiveExtTabIndex(null);
  }, [location.pathname, nativeContributions]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const baseUrl = await discoveryApi.getBaseUrl('catalog');
      const response = await fetchApi.fetch(
        `${baseUrl}/ansible/sync/status?ansible_contents=true`,
      );
      if (!response.ok) {
        setHasConfiguredSources(false);
        return;
      }
      const data = await response.json();
      const statusMap: SyncStatusMap = {};
      const providers = data.content?.providers || [];
      providers.forEach(
        (provider: {
          sourceId: string;
          lastSyncTime: string | null;
          lastFailedSyncTime: string | null;
        }) => {
          statusMap[provider.sourceId] = {
            lastSyncTime: provider.lastSyncTime,
            lastFailedSyncTime: provider.lastFailedSyncTime,
          };
        },
      );
      setSyncStatusMap(statusMap);
      setHasConfiguredSources(providers.length > 0);
    } catch {
      setHasConfiguredSources(false);
    }
  }, [discoveryApi, fetchApi]);

  useEffect(() => {
    void fetchSyncStatus();
  }, [fetchSyncStatus]);

  useEffect(() => {
    if (prevSyncInProgressRef.current && !isSyncInProgress) {
      void fetchSyncStatus();
    }
    prevSyncInProgressRef.current = isSyncInProgress;
  }, [isSyncInProgress, fetchSyncStatus]);

  const handleSyncClick = () => setSyncDialogOpen(true);
  const handleSourcesStatusChange = useCallback((status: boolean | null) => {
    setHasConfiguredSources(prev => status ?? prev);
  }, []);
  const handleSyncsStarted = useCallback(
    (syncs: StartedSyncInfo[]) => {
      startTracking(syncs);
    },
    [startTracking],
  );

  const syncDisabled = hasConfiguredSources === false || isSyncInProgress;
  let syncDisabledReason: string | undefined;
  if (hasConfiguredSources === false) {
    syncDisabledReason = 'No content sources configured';
  } else if (isSyncInProgress && !syncProgress?.length) {
    syncDisabledReason = 'Sync in progress';
  }

  const onTabSelect = useCallback(
    (index: number) => {
      if (index < GIT_REPO_BUILT_IN_TABS) {
        // Built-in tab: reset extension selection and navigate to the URL route.
        setActiveExtTabIndex(null);
        const tab = tabs[index];
        if (tab) {
          navigate(`${rootLink()}/repositories/${tab.path}`);
        }
      } else if (nativeContributions) {
        const id = extensionTabs[index - GIT_REPO_BUILT_IN_TABS]?.id;
        if (id) setSearchParams({ catalogTab: id });
      } else setActiveExtTabIndex(index - GIT_REPO_BUILT_IN_TABS);
    },
    [navigate, rootLink, nativeContributions, extensionTabs, setSearchParams],
  );

  let content: React.ReactNode;
  if (activeExtTabIndex !== null) {
    // Extension tab is active — render its component.
    const extContribution = extensionTabs[activeExtTabIndex];
    content = extContribution ? (
      <ExtensionTabContent
        key={extContribution.id}
        contribution={extContribution}
      />
    ) : null;
  } else if (selectedTab === 1) {
    content = (
      <RepositoriesCIActivityTab
        key="ci-activity"
        cachedEntities={gitReposCache.getState()?.entities}
      />
    );
  } else {
    content = (
      <RepositoriesTable
        key="catalog"
        syncStatusMap={syncStatusMap}
        onSourcesStatusChange={handleSourcesStatusChange}
      />
    );
  }

  // Overall tab index for HeaderTabs: extension tabs sit after built-ins.
  const activeTabIndex =
    activeExtTabIndex !== null
      ? GIT_REPO_BUILT_IN_TABS + activeExtTabIndex
      : selectedTab;

  return (
    <Page themeId="app">
      <Content>
        <RepositoriesPageHeaderSection
          onSyncClick={handleSyncClick}
          syncDisabled={syncDisabled}
          syncDisabledReason={syncDisabledReason}
          syncInProgress={isSyncInProgress}
          syncProgress={syncProgress}
          actions={
            <>
              <NativeCatalogHeaderActions
                contentType={CONTENT_TYPES.PLAYBOOK_REPOSITORY}
                templatePath={(namespace, name) =>
                  `/self-service/create/templates/${namespace}/${name}`
                }
              />
              {!nativeContributions && listActions.length > 0 ? (
                <Fragment>
                  {listActions.map(action =>
                    action.to ? (
                      <LinkButton
                        key={action.id}
                        variant="contained"
                        color="primary"
                        to={action.to}
                        startIcon={action.icon ? <action.icon /> : undefined}
                      >
                        {action.label}
                      </LinkButton>
                    ) : (
                      <Button
                        key={action.id}
                        variant="contained"
                        color="primary"
                        startIcon={action.icon ? <action.icon /> : undefined}
                        disabled
                      >
                        {action.label}
                      </Button>
                    ),
                  )}
                </Fragment>
              ) : undefined}
            </>
          }
        />
        <Box className={classes.tabsSection}>
          <HeaderTabs
            selectedIndex={activeTabIndex}
            onChange={onTabSelect}
            tabs={
              [
                ...tabs.map(({ label, icon }) => ({
                  id: label.toLowerCase().replaceAll(/\s+/g, '-'),
                  label: (
                    <Box className={classes.tabWithIcon}>
                      {icon}
                      {label}
                    </Box>
                  ),
                })),
                ...extensionTabs.map(et => {
                  const Icon = et.icon;
                  return {
                    id: et.id,
                    label: (
                      <Box className={classes.tabWithIcon}>
                        {Icon && <Icon fontSize="small" />}
                        {et.label}
                      </Box>
                    ),
                  };
                }),
              ] as any
            }
          />
        </Box>
        <Box className={classes.tabContent}>{content}</Box>
      </Content>
      <SyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        onSyncsStarted={handleSyncsStarted}
        showNotification={showNotification}
      />
    </Page>
  );
};

// Inner content component that uses the notification context
const GitRepositoriesRoutesContent = () => {
  const { notifications, removeNotification } = useNotifications();

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="catalog" replace />} />
        <Route path="catalog" element={<GitRepositoriesPage />} />
        <Route path="ci-activity" element={<GitRepositoriesPage />} />
        <Route path=":repositoryName" element={<RepositoryDetailsPage />} />
        <Route path="*" element={<Navigate to="catalog" replace />} />
      </Routes>
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
};

// Standalone route wrapper used by the dynamic plugin mount at /self-service/repositories
// so detail URLs like /self-service/repositories/:repositoryName resolve correctly.
export const GitRepositoriesRoutesPage = () => {
  return (
    <RequirePermission permission={gitRepositoriesViewPermission}>
      <NotificationProvider>
        <GitRepositoriesRoutesContent />
      </NotificationProvider>
    </RequirePermission>
  );
};
