import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  Suspense,
} from 'react';
import {
  Page,
  Content,
  HeaderTabs,
  ErrorBoundary,
} from '@backstage/core-components';
import { Box, makeStyles } from '@material-ui/core';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  RequirePermission,
  usePermission,
} from '@backstage/plugin-permission-react';
import type { Permission } from '@backstage/plugin-permission-common';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';
import type { GitRepositoriesPageTabDefinition } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { useGitRepositoriesExtensions } from './useGitRepositoriesExtensions';
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
      permission?: GitRepositoriesPageTabDefinition['permission'];
      resourceRef?: GitRepositoriesPageTabDefinition['resourceRef'];
    };

type TabAuthorization = 'loading' | 'allowed' | 'denied';

/**
 * Renders nothing; resolves whether `tabId` should be visible based on its
 * permission and reports the result up so the tab bar can hide unauthorized
 * extension tabs entirely instead of rendering a "missing permissions" page
 * behind a clickable tab.
 */
const TabVisibilityProbe = ({
  tabId,
  permission,
  resourceRef,
  onResolved,
}: {
  tabId: string;
  permission: Permission;
  resourceRef: string | undefined;
  onResolved: (tabId: string, authorization: TabAuthorization) => void;
}) => {
  const { loading, allowed } = usePermission({
    permission,
    resourceRef,
  } as Parameters<typeof usePermission>[0]);

  useEffect(() => {
    let authorization: TabAuthorization = 'denied';
    if (loading) {
      authorization = 'loading';
    } else if (allowed) {
      authorization = 'allowed';
    }
    onResolved(tabId, authorization);
  }, [tabId, loading, allowed, onResolved]);

  return null;
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

const findMatchingTab = (
  pathname: string,
  tabs: ResolvedGitRepoTab[],
): ResolvedGitRepoTab | undefined =>
  [...tabs]
    .sort((a, b) => b.path.length - a.path.length)
    .find(tab => repositoryTabPathMatches(pathname, tab.path));

const getTabIndexFromPath = (
  pathname: string,
  tabs: ResolvedGitRepoTab[],
): number => {
  const matched = findMatchingTab(pathname, tabs);
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
  const extensionsApi = useGitRepositoriesExtensions();
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
      permission: tab.permission,
      resourceRef: tab.resourceRef,
    }));
    return [...CORE_TABS, ...extensionTabs].sort((a, b) => a.order - b.order);
  }, [extensionsApi]);

  const [tabAuthorization, setTabAuthorization] = useState<
    Record<string, TabAuthorization>
  >({});

  const handleTabResolved = useCallback(
    (tabId: string, authorization: TabAuthorization) => {
      setTabAuthorization(prev =>
        prev[tabId] === authorization
          ? prev
          : { ...prev, [tabId]: authorization },
      );
    },
    [],
  );

  // Permission-gated extension tabs are hidden until explicitly allowed, so
  // an unauthorized user never sees a clickable tab that then 404s.
  const visibleTabs = useMemo(
    () =>
      tabs.filter(
        tab =>
          tab.kind !== 'extension' ||
          !tab.permission ||
          tabAuthorization[tab.id] === 'allowed',
      ),
    [tabs, tabAuthorization],
  );

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

  const selectedTab = getTabIndexFromPath(location.pathname, visibleTabs);

  const repositoryDetailPath = useCallback(
    (entityName: string, ruleId?: string) => {
      const base = `${rootLink()}/repositories/${entityName}`;
      return ruleId ? `${base}?rule=${encodeURIComponent(ruleId)}` : base;
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

  // Deep-linking straight to a permission-gated tab's path must not leave the
  // user stranded on a URL for a tab that's hidden from the tab bar.
  useEffect(() => {
    const matchedTab = findMatchingTab(location.pathname, tabs);
    if (
      matchedTab?.kind === 'extension' &&
      matchedTab.permission &&
      tabAuthorization[matchedTab.id] === 'denied'
    ) {
      navigate(`${rootLink()}/repositories/catalog`, { replace: true });
    }
  }, [location.pathname, tabs, tabAuthorization, navigate, rootLink]);

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
      const tab = visibleTabs[index];
      if (tab) {
        navigate(`${rootLink()}/repositories/${tab.path}`);
      }
    },
    [navigate, rootLink, visibleTabs],
  );

  const activeTab = visibleTabs[selectedTab];

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
      <ErrorBoundary>
        <Suspense fallback={null}>
          {activeTab.render({ repositoryDetailPath })}
        </Suspense>
      </ErrorBoundary>
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
        {tabs
          .filter(
            (tab): tab is Extract<ResolvedGitRepoTab, { kind: 'extension' }> =>
              tab.kind === 'extension' && !!tab.permission,
          )
          .map(tab => (
            <TabVisibilityProbe
              key={tab.id}
              tabId={tab.id}
              permission={tab.permission!}
              resourceRef={tab.resourceRef}
              onResolved={handleTabResolved}
            />
          ))}
        <Box className={classes.tabsSection}>
          <HeaderTabs
            selectedIndex={selectedTab}
            onChange={onTabSelect}
            tabs={visibleTabs.map(({ label, path }) => ({
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
  const extensionsApi = useGitRepositoriesExtensions();
  const extensionTabPaths = extensionsApi.getPageTabs().map(tab => tab.path);

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="catalog" replace />} />
        <Route path="catalog" element={<GitRepositoriesPage />} />
        <Route path="ci-activity" element={<GitRepositoriesPage />} />
        {extensionTabPaths.map(path => (
          <Route key={path} path={path} element={<GitRepositoriesPage />} />
        ))}
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
