import { Route, Routes, Navigate } from 'react-router';
import { EETabs } from './TabviewPage';
import { EEDetailsPage } from './catalog/EEDetailsPage';

export const EEPage = () => {
  return (
    <Routes>
      <Route index element={<Navigate to="catalog" replace />} />
      <Route path="catalog" element={<EETabs />} />
      <Route path="create" element={<EETabs />} />
      <Route path="docs" element={<EETabs />} />
      <Route path="catalog/:templateName" element={<EEDetailsPage />} />
      <Route path="*" element={<Navigate to="catalog" replace />} />
    </Routes>
  );
};
