import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { WizardCatalog } from '../WizardCatalog';
import { CreateTask } from '../CreateTask';
import { RunTask } from '../RunTask';
import { FeedbackFooter } from '../feedback/FeedbackFooter';
import { MyItems } from '../MyItems';
import { MyItemsDetails } from '../MyItemsDetails';
import { FavoritesProvider } from '../../helpers/Favorite';

export const RouteView = () => {
  return (
    <FavoritesProvider>
      <Routes>
        <Route path="/catalog" element={<WizardCatalog />} />
        <Route
          path="/catalog/create-task/:namespace/:name"
          element={<CreateTask />}
        />
        <Route path="/catalog/create-task/task/:taskId" element={<RunTask />} />
        <Route path="/my-items" element={<MyItems />} />
        <Route path="/my-items/:namespace/:name" element={<MyItemsDetails />} />
        {/* Default redirects */}
        <Route path="/catalog/*" element={<Navigate to="/wizard/catalog" />} />
        <Route
          path="/my-items/*"
          element={<Navigate to="/wizard/my-items" />}
        />
        <Route path="*" element={<Navigate to="/wizard/catalog" />} />
      </Routes>
      <FeedbackFooter />
    </FavoritesProvider>
  );
};
