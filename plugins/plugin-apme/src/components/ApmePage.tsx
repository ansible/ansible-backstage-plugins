import React, { useCallback, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Header, Page } from '@backstage/core-components';
import { Snackbar } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
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
import type { NotificationItem } from '../types/api';

export const ApmePage = () => {
  const [toast, setToast] = useState<NotificationItem | null>(null);

  const handleNotification = useCallback((item: NotificationItem) => {
    setToast(item);
  }, []);

  useNotificationStream({ onNotification: handleNotification });

  return (
    <Page themeId="tool">
      <Header title="APME" subtitle="Ansible Policy & Modernization Engine" />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/activity/:activityId" element={<ActivityDetailPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:fqcn" element={<CollectionDetailPage />} />
        <Route path="/python-packages" element={<PythonPackagesPage />} />
        <Route path="/python-packages/:name" element={<PythonPackageDetailPage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>

      <Snackbar
        open={toast !== null}
        autoHideDuration={8000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert onClose={() => setToast(null)} severity={toast.variant === 'danger' ? 'error' : toast.variant}>
            <strong>{toast.title}</strong> — {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Page>
  );
};
