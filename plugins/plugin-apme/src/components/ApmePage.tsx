import { useCallback, useEffect, useState } from 'react';
import {
  Routes,
  Route,
  useNavigate,
  useParams,
  Navigate,
} from 'react-router-dom';
import { Header, HeaderTabs, Page, Content } from '@backstage/core-components';
import {
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Snackbar,
  Tooltip,
  Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import NotificationsIcon from '@material-ui/icons/Notifications';
import CloseIcon from '@material-ui/icons/Close';
import DoneAllIcon from '@material-ui/icons/DoneAll';
import DeleteIcon from '@material-ui/icons/Delete';
import { useApi } from '@backstage/core-plugin-api';
import { DashboardPage } from '../pages/DashboardPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { ActivityPage } from '../pages/ActivityPage';
import { ActivityDetailPage } from '../pages/ActivityDetailPage';
import { SessionsPage } from '../pages/SessionsPage';
import { SessionDetailPage } from '../pages/SessionDetailPage';
import { HealthPage } from '../pages/HealthPage';
import { RulesPage } from '../pages/RulesPage';
import { CollectionsPage } from '../pages/CollectionsPage';
import { CollectionDetailPage } from '../pages/CollectionDetailPage';
import { PythonPackagesPage } from '../pages/PythonPackagesPage';
import { PythonPackageDetailPage } from '../pages/PythonPackageDetailPage';
import { PlaygroundPage } from '../pages/PlaygroundPage';
import { SettingsPage } from '../pages/SettingsPage';
import { useNotificationStream } from '../hooks/useNotificationStream';
import { apmeApiRef } from '../api/ApmeApi';
import type { NotificationItem } from '../types/api';
import { timeAgo } from './format';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', nav: 'dashboard' },
  { id: 'projects', label: 'Projects', nav: 'projects' },
  { id: 'activity', label: 'Activity', nav: 'activity' },
  { id: 'analytics', label: 'Analytics', nav: 'analytics' },
  { id: 'sessions', label: 'Sessions', nav: 'sessions' },
  { id: 'collections', label: 'Collections', nav: 'collections' },
  { id: 'packages', label: 'Packages', nav: 'python-packages' },
  { id: 'rules', label: 'Rules', nav: 'rules' },
  { id: 'playground', label: 'Playground', nav: 'playground' },
  { id: 'health', label: 'Health', nav: 'health' },
  { id: 'settings', label: 'Settings', nav: 'settings' },
];

const VARIANT_TO_SEVERITY: Record<
  string,
  'success' | 'error' | 'warning' | 'info'
> = {
  success: 'success',
  danger: 'error',
  warning: 'warning',
  info: 'info',
};

export const ApmePage = () => {
  const api = useApi(apmeApiRef);
  const navigate = useNavigate();
  const param = useParams();
  const section = param['*'] ?? '';

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);

  useEffect(() => {
    api
      .listNotifications()
      .then(items => {
        setNotifications(Array.isArray(items) ? items : []);
      })
      .catch(() => {});
  }, [api]);

  const handleNotification = useCallback((item: NotificationItem) => {
    setNotifications(prev => [item, ...prev.filter(n => n.id !== item.id)]);
    setToast(item);
  }, []);

  useNotificationStream({ onNotification: handleNotification });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkRead = useCallback(
    async (id: number) => {
      try {
        await api.markNotificationRead(id);
        setNotifications(prev =>
          prev.map(n => (n.id === id ? { ...n, read: true } : n)),
        );
      } catch {
        /* ignore */
      }
    },
    [api],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      /* ignore */
    }
  }, [api]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await api.deleteNotification(id);
        setNotifications(prev => prev.filter(n => n.id !== id));
      } catch {
        /* ignore */
      }
    },
    [api],
  );

  const topSegment = section.split('/')[0] || 'dashboard';
  const selectedTabIndex = TABS.findIndex(t => t.nav === topSegment);
  const [selectedTab, setSelectedTab] = useState(
    selectedTabIndex > -1 ? selectedTabIndex : 0,
  );

  useEffect(() => {
    if (selectedTabIndex > -1) {
      setSelectedTab(selectedTabIndex);
    }
  }, [selectedTabIndex]);

  const onTabSelect = (index: number) => {
    setSelectedTab(index);
    navigate(TABS[index].nav);
  };

  if (section === '') {
    return <Navigate to="dashboard" />;
  }

  return (
    <Page themeId="tool">
      <Header title="APME" subtitle="Ansible Policy & Modernization Engine">
        <Tooltip title="Notifications">
          <IconButton color="inherit" onClick={() => setDrawerOpen(true)}>
            <Badge
              badgeContent={unreadCount}
              color="error"
              invisible={unreadCount === 0}
            >
              <NotificationsIcon />
            </Badge>
          </IconButton>
        </Tooltip>
      </Header>
      <HeaderTabs
        selectedIndex={selectedTab}
        onChange={onTabSelect}
        tabs={TABS.map(({ id, label }) => ({ id, label }))}
      />
      <Content>
        <Routes>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="activity/:activityId" element={<ActivityDetailPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="collections/:fqcn" element={<CollectionDetailPage />} />
          <Route path="python-packages" element={<PythonPackagesPage />} />
          <Route
            path="python-packages/:name"
            element={<PythonPackageDetailPage />}
          />
          <Route path="playground" element={<PlaygroundPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </Content>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <Box style={{ width: 380 }}>
          <Box
            display="flex"
            alignItems="center"
            style={{ padding: '12px 16px' }}
          >
            <Typography variant="h6" style={{ flex: 1 }}>
              Notifications
            </Typography>
            {unreadCount > 0 && (
              <Tooltip title="Mark all as read">
                <IconButton size="small" onClick={handleMarkAllRead}>
                  <DoneAllIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" onClick={() => setDrawerOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Divider />
          {notifications.length === 0 ? (
            <Box style={{ padding: 24, textAlign: 'center' }}>
              <Typography color="textSecondary">No notifications</Typography>
            </Box>
          ) : (
            <List dense>
              {notifications.map(n => (
                <ListItem
                  key={n.id}
                  button
                  onClick={() => {
                    if (!n.read) handleMarkRead(n.id);
                  }}
                  style={{
                    opacity: n.read ? 0.6 : 1,
                    backgroundColor: n.read
                      ? 'transparent'
                      : 'rgba(25, 118, 210, 0.04)',
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography
                        variant="subtitle2"
                        style={{ fontWeight: n.read ? 400 : 600 }}
                      >
                        {n.title}
                      </Typography>
                    }
                    secondary={
                      <>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          component="span"
                        >
                          {n.message}
                        </Typography>
                        <br />
                        <Typography variant="caption" color="textSecondary">
                          {timeAgo(n.created_at)}
                        </Typography>
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleDelete(n.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Drawer>

      <Snackbar
        open={toast !== null}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={VARIANT_TO_SEVERITY[toast.variant] || 'info'}
          >
            <strong>{toast.title}</strong> — {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Page>
  );
};
