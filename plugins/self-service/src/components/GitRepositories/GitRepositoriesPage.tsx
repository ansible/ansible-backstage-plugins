import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  Suspense,
} from 'react';
import { Page, Content, HeaderTabs } from '@backstage/core-components';
import { Box, makeStyles } from '@material-ui/core';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';
import { gitRepositoriesExtensionsApiRef } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import type { GitRepositoriesPageTabDefinition } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
  useRouteRef,
} from '@backstage/core-plugin-api';
import { useSyncStatusPolling } from '../../hooks';
import { SyncDialog } from '../common';
import type { SyncStatusMap, StartedSyncInfo } from '../common';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '../notifications';

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
  tabContent: {
    paddingTop: theme.spacing(3),
  },
}));

type CoreGitRepoTab = {
  id: string;
  label: string;
  path: string;
  order: number;
  kind: 'catalog' | 'ci-activity';
};

const CORE_TABS: CoreGitRepoTab[] = [
  {
    id: 'catalog',
    label: 'Catalog',
    path: 'catalog',
    order: 0,
    kind: 'catalog',
  },
  {
    id: 'ci-activity',
    label: 'CI Activity',
    path: 'ci-activity',
    order: 20,
    kind: 'ci-activity',
  },
];

type ResolvedGitRepoTab =
  | CoreGitRepoTab
  | {
      id: string;
      label: string;
      path: string;
      order: number;
      kind: 'extension';
      render: GitRepositoriesPageTabDefinition['render'];
    };

/** True when pathname selects this repositories page tab (exact segment match). */
export function repositoryTabPathMatches(
  pathname: string,
  tabPath: string,
): boolean {
  const segment = `/repositories/${tabPath}`;
  const index = pathname.indexOf(segment);
  if (index === -1) {
    return false;
  }
  const nextChar = pathname[index + segment.length];
  return nextChar === undefined || nextChar === '/' || nextChar === '?';
}

const getTabIndexFromPath = (
  pathname: string,
  tabs: ResolvedGitRepoTab[],
): number => {
  const sorted = [...tabs].sort((a, b) => b.path.length - a.path.length);
  const matched = sorted.find(tab =>
    repositoryTabPathMatches(pathname, tab.path),
  );
  if (!matched) {
    return 0;
  }
  const matchIndex = tabs.findIndex(tab => tab.id === matched.id);
  return matchIndex >= 0 ? matchIndex : 0;
};

export const GitRepositoriesPage = () => {
  const classes = useStyles();
  const location = useLocation();
  const navigate = useNavigate();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const extensionsApi = useApi(gitRepositoriesExtensionsApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const { isSyncInProgress, syncProgress, startTracking } =
    useSyncStatusPolling();

  const tabs = useMemo((): ResolvedGitRepoTab[] => {
    const extensionTabs = extensionsApi.getPageTabs().map(tab => ({
      id: tab.id,
      label: tab.label,
      path: tab.path,
      order: tab.order,
      kind: 'extension' as const,
      render: tab.render,
    }));
    return [...CORE_TABS, ...extensionTabs].sort((a, b) => a.order - b.order);
  }, [extensionsApi]);

  const extensionHeaderActions = useMemo(() => {
    const actions = extensionsApi
      .getPageHeaderActions()
      .sort((a, b) => a.order - b.order);
    if (actions.length === 0) {
      return undefined;
    }
    return (
      <>
        {actions.map(action => (
          <span key={action.id}>{action.render()}</span>
        ))}
      </>
    );
  }, [extensionsApi]);

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const [syncStatusMap, setSyncStatusMap] = useState<SyncStatusMap>({});
  const prevSyncInProgressRef = useRef(false);

  const selectedTab = getTabIndexFromPath(location.pathname, tabs);

  const repositoryDetailPath = useCallback(
    (entityName: string, ruleId?: string) => {
      const base = `${rootLink()}/repositories/${entityName}?tab=quality`;
      return ruleId ? `${base}&rule=${encodeURIComponent(ruleId)}` : base;
    },
    [rootLink],
  );

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
    [navigate, rootLink, tabs],
  );

  const activeTab = tabs[selectedTab];

  let content;
  if (activeTab?.kind === 'catalog') {
    content = (
      <RepositoriesTable
        key="catalog"
        syncStatusMap={syncStatusMap}
        onSourcesStatusChange={handleSourcesStatusChange}
      />
    );
  } else if (activeTab?.kind === 'ci-activity') {
    content = (
      <RepositoriesCIActivityTab
        key="ci-activity"
        cachedEntities={gitReposCache.getState()?.entities}
      />
    );
  } else if (activeTab?.kind === 'extension') {
    content = (
      <Suspense fallback={null}>
        {activeTab.render({ repositoryDetailPath })}
      </Suspense>
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

  return (
    <Page themeId="app">
      <Content>
        <RepositoriesPageHeaderSection
          onSyncClick={handleSyncClick}
          syncDisabled={syncDisabled}
          syncDisabledReason={syncDisabledReason}
          syncInProgress={isSyncInProgress}
          syncProgress={syncProgress}
          extensionHeaderActions={extensionHeaderActions}
        />
        <Box className={classes.tabsSection}>
          <HeaderTabs
            selectedIndex={selectedTab}
            onChange={onTabSelect}
            tabs={tabs.map(({ label, path }) => ({
              id: path,
              label,
            }))}
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

// Inner content component that uses the notification context
const GitRepositoriesRoutesContent = () => {
  const { notifications, removeNotification } = useNotifications();

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="catalog" replace />} />
        <Route path="catalog" element={<GitRepositoriesPage />} />
        <Route path="quality" element={<GitRepositoriesPage />} />
        <Route path="ci-activity" element={<GitRepositoriesPage />} />
        <Route path="quality-settings" element={<GitRepositoriesPage />} />
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
