import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import {
  wizardCatalogPlugin,
  WizardCatalogPage,
  CreateTaskPage,
  RunTaskPage,
} from '../src/plugin';

createDevApp()
  .registerPlugin(wizardCatalogPlugin)
  .addPage({
    element: <WizardCatalogPage />,
    title: 'Root Page',
    path: '/wizard/catalog',
  })
  .addPage({
    element: <CreateTaskPage />,
    title: 'Create task page',
    path: '/wizard/catalog/create-task/:namespace/:name',
  })
  .addPage({
    element: <RunTaskPage />,
    title: 'Running task page',
    path: '/wizard/catalog/create-task/task/:taskId',
  })
  .render();
