import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { selfServicePlugin, SelfServicePage } from '../src/plugin';

createDevApp()
  .registerPlugin(selfServicePlugin)
  .addPage({
    element: <SelfServicePage />,
    title: 'Root Page',
    path: '/self-service',
  })
  .render();
