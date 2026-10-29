import { Route, Routes } from 'react-router-dom';
import { RequiresContentPermission } from '../common/RequiresContentPermission';
import { CollectionsCatalogPage } from './CollectionsCatalogPage';
import { CollectionDetailsPage } from './CollectionDetailsPage';
import type { ReactElement } from 'react';

/** Collection catalog route entry point. */
export function CollectionsRoutesPage(): ReactElement {
  return (
    <RequiresContentPermission>
      <Routes>
        <Route index element={<CollectionsCatalogPage />} />
        <Route path=":namespace/:name" element={<CollectionDetailsPage />} />
      </Routes>
    </RequiresContentPermission>
  );
}
