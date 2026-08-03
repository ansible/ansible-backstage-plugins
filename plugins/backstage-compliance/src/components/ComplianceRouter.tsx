import React, { useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Page,
  Header,
  HeaderTabs,
  Content,
  ErrorPanel,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';

const DynamicTabRefreshContext = createContext<(() => void) | undefined>(undefined);
export const useDynamicTabRefresh = () => useContext(DynamicTabRefreshContext);
import { Box, Button, Chip, makeStyles } from '@material-ui/core';
import { ComplianceDashboard } from './ComplianceDashboard';
import { ProfileBrowser } from './ProfileBrowser';
import { ScanLauncher } from './ScanLauncher';
import { ResultsViewer } from './ResultsViewer';
import { RemediationProfileBuilder } from './RemediationProfileBuilder';
import { RemediationExecution } from './RemediationExecution';
import { ProfileSettings } from './ProfileSettings';
import { RemediationsList } from './RemediationsList';
import { ScanHistory } from './ScanHistory';
import { ChainView } from './ChainView';
import { InventoriesList } from './InventoriesList';
import { InventoryDetail } from './InventoryDetail';
import { ActiveJobsBanner } from './ActiveJobsBanner';
import { DynamicProfileTab } from './DynamicProfileTab';
import { complianceApiRef } from '../api';
import { useComplianceEnabled } from '../hooks/useComplianceEnabled';
import type { ComplianceProfile } from '@ansible/backstage-compliance-common/types';

/**
 * Error boundary for the Compliance tab.
 *
 * React error boundaries must be class components. This catches any unhandled
 * exception in a child route and renders a Backstage ErrorPanel instead of
 * crashing the entire tab.
 */
class ComplianceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <Box p={4}>
          <ErrorPanel
            title="Something went wrong in the Compliance plugin"
            error={error}
          />
          <Box mt={2} display="flex" justifyContent="center">
            <Button
              variant="outlined"
              onClick={() => this.setState({ error: undefined })}
            >
              Try Again
            </Button>
          </Box>
        </Box>
      );
    }
    return this.props.children;
  }
}

const CORE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'scan', label: 'New Scan' },
  { id: 'results', label: 'Results' },
  { id: 'remediations', label: 'Remediations' },
  { id: 'inventories', label: 'Inventories' },
  { id: 'settings', label: 'Settings' },
];

const coreTabRouteMap: Record<string, string> = {
  overview: '',
  scan: 'scan',
  results: 'results',
  remediations: 'remediations',
  inventories: 'inventories',
  settings: 'settings',
};

interface DynamicTabEntry {
  id: string;
  label: string;
  profile: ComplianceProfile;
}

const useStyles = makeStyles({
  previewChip: {
    verticalAlign: 'middle',
  },
});

const ComplianceRouterInner = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const api = useApi(complianceApiRef);

  const [dynamicTabs, setDynamicTabs] = useState<DynamicTabEntry[]>([]);
  const [tabRefreshKey, setTabRefreshKey] = useState(0);

  const refreshDynamicTabs = useCallback(() => {
    setTabRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getRegisteredProfiles().then(profiles => {
      if (cancelled) return;
      const tabs: DynamicTabEntry[] = profiles
        .filter(p => p.displayConfig?.tab && p.connectionStatus !== 'disconnected')
        .map(p => ({
          id: `profile-${p.id}`,
          label: p.displayConfig!.tab!.label,
          profile: p,
        }));
      setDynamicTabs(tabs);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [api, tabRefreshKey]);

  const allTabs = useMemo(() => {
    const settingsIdx = CORE_TABS.findIndex(t => t.id === 'settings');
    const before = CORE_TABS.slice(0, settingsIdx);
    const settings = CORE_TABS.slice(settingsIdx);
    const dynamic = dynamicTabs.map(dt => ({ id: dt.id, label: dt.label }));
    return [...before, ...dynamic, ...settings];
  }, [dynamicTabs]);

  const getSelectedTab = (): number => {
    const path = location.pathname.replace(/^\/compliance\/?/, '');
    if (path.startsWith('scan')) return 1;
    if (path.startsWith('results') || path.startsWith('chain/') || path.startsWith('remediation/') || path.startsWith('execute') || path.startsWith('remediation-result')) return 2;
    if (path === 'remediations' || path.startsWith('remediation-edit/')) return 3;
    if (path.startsWith('inventories')) return 4;

    for (let i = 0; i < dynamicTabs.length; i++) {
      if (path.startsWith(`profile-tab/${dynamicTabs[i].profile.id}`)) {
        return 5 + i;
      }
    }

    if (path.startsWith('settings')) return 5 + dynamicTabs.length;
    return 0;
  };

  const selectedTab = getSelectedTab();

  const handleTabChange = (index: number) => {
    const tab = allTabs[index];
    if (coreTabRouteMap[tab.id] !== undefined) {
      navigate(coreTabRouteMap[tab.id]);
    } else {
      const dt = dynamicTabs.find(d => d.id === tab.id);
      if (dt) navigate(`profile-tab/${dt.profile.id}`);
    }
  };

  return (
    <DynamicTabRefreshContext.Provider value={refreshDynamicTabs}>
      <Page themeId="app">
        <Header
          title="Compliance"
          subtitle={
            <Box display="inline-flex" alignItems="center" style={{ gap: 8 }}>
              <span>Scan, review, and remediate infrastructure compliance</span>
              <Chip label="Preview" size="small" variant="outlined" className={classes.previewChip} />
            </Box>
          }
          style={{ background: 'inherit' }}
        />
        <HeaderTabs
          selectedIndex={selectedTab}
          onChange={handleTabChange}
          tabs={allTabs}
        />
        <Content>
          <ComplianceErrorBoundary>
            <Routes>
              <Route path="/" element={<ComplianceDashboard />} />
              <Route path="/profiles/all" element={<ProfileBrowser />} />
              <Route path="/profiles/:profileId" element={<ProfileBrowser />} />
              <Route path="/scan" element={<ScanLauncher />} />
              <Route path="/results" element={<ScanHistory />} />
              <Route path="/results/:jobId" element={<ResultsViewer />} />
              <Route path="/chain/:executionId" element={<ChainView />} />
              <Route path="/remediation/:jobId" element={<RemediationProfileBuilder />} />
              <Route path="/remediation-edit/:remediationId" element={<RemediationProfileBuilder />} />
              <Route path="/execute/launch" element={<RemediationExecution />} />
              <Route path="/execute/:jobId" element={<RemediationExecution />} />
              <Route path="/remediation-result/:jobId" element={<RemediationExecution viewMode={true} />} />
              <Route path="/remediations" element={<RemediationsList />} />
              <Route path="/inventories" element={<InventoriesList />} />
              <Route path="/inventories/:inventoryId" element={<InventoryDetail />} />
              {dynamicTabs.map(dt => (
                <Route
                  key={dt.id}
                  path={`/profile-tab/${dt.profile.id}`}
                  element={
                    <DynamicProfileTab
                      profile={dt.profile}
                      tabConfig={dt.profile.displayConfig!.tab!}
                    />
                  }
                />
              ))}
              <Route path="/settings" element={<ProfileSettings />} />
            </Routes>
          </ComplianceErrorBoundary>
        </Content>
      </Page>
      <ActiveJobsBanner />
    </DynamicTabRefreshContext.Provider>
  );
};

const ComplianceRouter = () => {
  const enabled = useComplianceEnabled();
  if (!enabled) return null;
  return <ComplianceRouterInner />;
};

export { ComplianceRouter };
