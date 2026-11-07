import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { EERoutesPage } from './ExecutionEnvironments/EERoutesPage';

/** Mounts the shared content catalogs beneath the legacy host's content route. */
export function AutomationContentRoutes(): ReactElement {
  return (
    <Routes>
      <Route index element={<Navigate to="/content/ee" replace />} />
      <Route path="execution-environments/*" element={<EERoutesPage />} />
    </Routes>
  );
}
