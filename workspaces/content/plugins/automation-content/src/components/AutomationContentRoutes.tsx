import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ContentLandingPage } from './ContentLandingPage';
import { EERoutesPage } from './ExecutionEnvironments/EERoutesPage';
import { CollectionsRoutesPage } from './CollectionsCatalog/CollectionsRoutesPage';

/** Mounts the shared content catalogs beneath the legacy host's content route. */
export function AutomationContentRoutes(): ReactElement {
  return (
    <Routes>
      <Route index element={<ContentLandingPage />} />
      <Route path="execution-environments/*" element={<EERoutesPage />} />
      <Route path="collections/*" element={<CollectionsRoutesPage />} />
    </Routes>
  );
}
