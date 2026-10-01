import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type PropsWithChildren,
} from 'react';
import { Page, Content, HeaderTabs } from '@backstage/core-components';
import { Box, makeStyles } from '@material-ui/core';
import {
  matchPath,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import CategoryOutlinedIcon from '@material-ui/icons/CategoryOutlined';
import TimelineIcon from '@material-ui/icons/Timeline';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { useSelfServiceRootLink, useSyncStatusPolling } from '../../hooks';
import { SyncDialog } from '../common';
import type { SyncStatusMap, StartedSyncInfo } from '../common';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '../notifications';

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

export const SELF_SERVICE_REPOS = '/self-service/repositories';
export const SELF_SERVICE_REPOS_CATALOG = '/self-service/repositories/catalog';
export const SELF_SERVICE_REPOS_CI = '/self-service/repositories/ci-activity';

const tabs = [
  { id: 0, label: 'Catalog', icon: <CategoryOutlinedIcon />, path: 'catalog' },
  { id: 1, label: 'CI Activity', icon: <TimelineIcon />, path: 'ci-activity' },
];

const getTabIndexFromPath = (pathname: string): number => {
  if (pathname.includes('/repositories/ci-activity')) return 1;
  return 0;
};

export const GitRepositoriesPage = () => {
  const classes = useStyles();
  const location = useLocation();
  const navigate = useNavigate();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const rootLink = useSelfServiceRootLink();
  const { isSyncInProgress, syncProgress, startTracking } =
    useSyncStatusPolling();

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const [syncStatusMap, setSyncStatusMap] = useState<SyncStatusMap>({});
  const prevSyncInProgressRef = useRef(false);

  const selectedTab = getTabIndexFromPath(location.pathname);

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
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  useEffect(() => {
    if (prevSyncInProgressRef.current && !isSyncInProgress) {
      fetchSyncStatus();
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
  } else if (isSyncInProgress) {
    syncDisabledReason = 'Sync in progress';
  }

  const onTabSelect = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) {
        navigate(`${rootLink()}/repositories/${tab.path}`);
      }
    },
    [navigate, rootLink],
  );

  const content =
    selectedTab === 1 ? (
      <RepositoriesCIActivityTab
        key="ci-activity"
        cachedEntities={gitReposCache.getState()?.entities}
      />
    ) : (
      <RepositoriesTable
        key="catalog"
        syncStatusMap={syncStatusMap}
        onSourcesStatusChange={handleSourcesStatusChange}
      />
    );

  return (
    <Page themeId="app">
      <Content>
        <RepositoriesPageHeaderSection
          onSyncClick={handleSyncClick}
          syncDisabled={syncDisabled}
          syncDisabledReason={syncDisabledReason}
          syncInProgress={isSyncInProgress}
          syncProgress={syncProgress}
        />
        <Box className={classes.tabsSection}>
          <HeaderTabs
            selectedIndex={selectedTab}
            onChange={onTabSelect}
            tabs={
              tabs.map(({ label, icon }) => ({
                id: label.toLowerCase().replaceAll(/\s+/g, '-'),
                label: (
                  <Box className={classes.tabWithIcon}>
                    {icon}
                    {label}
                  </Box>
                ),
              })) as any
            }
          />
        </Box>
        <Box className={classes.tabContent}>{content}</Box>
      </Content>
      <SyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        onSyncsStarted={handleSyncsStarted}
      />
    </Page>
  );
};

const resolveGitRepositoriesRouteElement = (pathname: string) => {
  if (
    pathname === SELF_SERVICE_REPOS ||
    pathname === `${SELF_SERVICE_REPOS}/`
  ) {
    return <Navigate to={SELF_SERVICE_REPOS_CATALOG} replace />;
  }

  const detailMatch =
    matchPath(
      { path: '/self-service/repositories/:repositoryName', end: true },
      pathname,
    ) || matchPath({ path: ':repositoryName', end: true }, pathname);
  const repositoryName = detailMatch?.params?.repositoryName;
  if (
    repositoryName &&
    repositoryName !== 'catalog' &&
    repositoryName !== 'ci-activity'
  ) {
    return <RepositoryDetailsPage />;
  }

  if (
    pathname === SELF_SERVICE_REPOS_CI ||
    matchPath({ path: SELF_SERVICE_REPOS_CI, end: true }, pathname) ||
    pathname.includes('/repositories/ci-activity') ||
    matchPath({ path: 'ci-activity', end: true }, pathname)
  ) {
    return <GitRepositoriesPage />;
  }

  if (
    pathname === SELF_SERVICE_REPOS_CATALOG ||
    matchPath({ path: SELF_SERVICE_REPOS_CATALOG, end: true }, pathname) ||
    pathname.includes('/repositories/catalog') ||
    matchPath({ path: 'catalog', end: true }, pathname)
  ) {
    return <GitRepositoriesPage />;
  }

  return <Navigate to={SELF_SERVICE_REPOS_CATALOG} replace />;
};

const GitRepositoriesPageProviders = ({ children }: PropsWithChildren) => (
  <RequirePermission permission={gitRepositoriesViewPermission}>
    <NotificationProvider>{children}</NotificationProvider>
  </RequirePermission>
);

const GitRepositoriesRoutesContent = () => {
  const { pathname } = useLocation();
  const { notifications, removeNotification } = useNotifications();

  return (
    <>
      {resolveGitRepositoriesRouteElement(pathname)}
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
};

/** RHDH 2.1 NFS: one PageBlueprint per repositories path (no splat). */
export const GitRepositoriesSectionPage = () => (
  <GitRepositoriesPageProviders>
    <GitRepositoriesRoutesContent />
  </GitRepositoriesPageProviders>
);

/**
 * Standalone route wrapper used by the dynamic plugin mount at /self-service/repositories.
 * Scalprum / RHDH 1.10: mounted once at `/self-service/repositories/*`.
 */
export const GitRepositoriesRoutesPage = () => (
  <GitRepositoriesPageProviders>
    <GitRepositoriesRoutesContent />
  </GitRepositoriesPageProviders>
);
