/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Typography, Box, makeStyles } from '@material-ui/core';
import SecurityIcon from '@material-ui/icons/Security';
import PlaylistPlayIcon from '@material-ui/icons/PlaylistPlay';
import HistoryIcon from '@material-ui/icons/History';
import { Header, Page, HeaderTabs, Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';

import { rootRouteRef } from '../../routes';
import { CertificateDashboard } from './CertificateDashboard';

const useStyles = makeStyles(() => ({
  tabContainer: {
    '& .MuiTab-root': {
      minWidth: '200px',
      padding: '12px 40px',
      fontSize: '16px',
    },
  },
  tabWithIcon: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
}));

const PlatformOpsHeader = () => {
  const headerTitle = (
    <Typography
      variant="h4"
      component="h1"
      style={{ fontWeight: 'bold', fontSize: '2rem' }}
    >
      Platform Operations
    </Typography>
  );

  return (
    <Header
      title={headerTitle}
      subtitle="Manage AAP infrastructure, certificates, and platform tasks"
      pageTitleOverride="Platform Operations"
      style={{
        fontFamily: 'Red Hat Text',
        color: 'white',
        paddingBottom: '16px',
      }}
    />
  );
};

const tabs = [
  { id: 0, label: 'Certificates', icon: <SecurityIcon />, path: 'certificates' },
  { id: 1, label: 'Tasks', icon: <PlaylistPlayIcon />, path: 'tasks' },
  { id: 2, label: 'History', icon: <HistoryIcon />, path: 'history' },
];

const getTabIndexFromPath = (pathname: string): number => {
  if (pathname.includes('/platform-ops/tasks')) return 1;
  if (pathname.includes('/platform-ops/history')) return 2;
  return 0;
};

export const PlatformOpsPage: React.FC = () => {
  const classes = useStyles();
  const location = useLocation();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);

  const selectedTab = useMemo(
    () => getTabIndexFromPath(location.pathname),
    [location.pathname],
  );

  const onTabSelect = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) {
        navigate(`${rootLink()}/platform-ops/${tab.path}`);
      }
    },
    [navigate, rootLink],
  );

  const content = useMemo(() => {
    switch (selectedTab) {
      case 1:
        return <TasksPlaceholder />;
      case 2:
        return <HistoryPlaceholder />;
      default:
        return <CertificateDashboard />;
    }
  }, [selectedTab]);

  return (
    <Page themeId="app">
      <PlatformOpsHeader />
      <HeaderTabs
        selectedIndex={selectedTab}
        onChange={onTabSelect}
        tabs={
          tabs.map(({ label, icon }) => ({
            id: label.toLowerCase(),
            label: (
              <Box className={classes.tabWithIcon}>
                {icon}
                {label}
              </Box>
            ),
          })) as any
        }
      />
      <Content>{content}</Content>
    </Page>
  );
};

const TasksPlaceholder = () => (
  <Box p={3}>
    <Typography variant="h5" gutterBottom>
      Platform Tasks
    </Typography>
    <Typography color="textSecondary">
      Register and manage platform operations tasks. Coming soon...
    </Typography>
  </Box>
);

const HistoryPlaceholder = () => (
  <Box p={3}>
    <Typography variant="h5" gutterBottom>
      Task History
    </Typography>
    <Typography color="textSecondary">
      View execution history of platform tasks. Coming soon...
    </Typography>
  </Box>
);
