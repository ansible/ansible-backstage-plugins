import { ImagesCatalogPage } from './ImagesCatalogPage';
import { RequiresContentPermission } from '../common/RequiresContentPermission';
import { EEDetailsPage } from './EEDetailsPage';
import { Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';

/** Execution environment discovery entry point. */
export function EERoutesPage(): ReactElement {
  return (
    <RequiresContentPermission>
      <Routes>
        <Route index element={<ImagesCatalogPage />} />
        <Route path=":ref" element={<EEDetailsPage />} />
      </Routes>
    </RequiresContentPermission>
  );
}
