import { Route, Routes } from 'react-router-dom';
import { CollectionsCatalogPage } from './CollectionsCatalogPage';
import type { ReactElement } from 'react';

/** Collection catalog route entry point. */
export function CollectionsRoutesPage(): ReactElement {
  return (
    <Routes>
      <Route index element={<CollectionsCatalogPage />} />
    </Routes>
  );
}
