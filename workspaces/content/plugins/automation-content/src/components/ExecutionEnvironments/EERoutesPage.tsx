import { RequiresContentPermission } from '../common/RequiresContentPermission';
import { EEDetailsPage } from './EEDetailsPage';
import { EECatalogPage } from './EECatalogPage';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';

/** Execution environment discovery entry point. */
export function EERoutesPage(): ReactElement {
  return (
    <RequiresContentPermission>
      <Routes>
        <Route index element={<Navigate to="images" replace />} />
        <Route path="images" element={<EECatalogPage view="images" />} />
        <Route path="catalog" element={<EECatalogPage view="catalog" />} />
        <Route path="create" element={<EECatalogPage view="create" />} />
        <Route path=":ref" element={<EEDetailsPage />} />
        <Route path="*" element={<Navigate to="images" replace />} />
      </Routes>
    </RequiresContentPermission>
  );
}
