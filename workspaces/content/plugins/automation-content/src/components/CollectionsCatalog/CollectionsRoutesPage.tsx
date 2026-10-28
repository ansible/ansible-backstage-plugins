import { Route, Routes } from 'react-router-dom';
import { CollectionsCatalogPage } from './CollectionsCatalogPage';
import { CollectionDetailsPage } from './CollectionDetailsPage';
import type { ReactElement } from 'react';

/** Collection catalog route entry point. */
export function CollectionsRoutesPage(): ReactElement {
  return (
    <Routes>
      <Route index element={<CollectionsCatalogPage />} />
      <Route path=":namespace/:name" element={<CollectionDetailsPage />} />
    </Routes>
  );
}
