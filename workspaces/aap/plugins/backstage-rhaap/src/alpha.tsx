/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  createFrontendPlugin,
  PageBlueprint,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';
import { AnsibleLogo } from './components/AnsibleLogo';
import { rootRouteRef } from './routes';
import { ScaffolderHeaderActionBlueprint } from '@ansible/portal-extension-api/alpha';
import { ScaffolderSyncNow } from './components/ScaffolderSyncNow/ScaffolderSyncNow';

const ansiblePlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'ansible',
  routes: {
    root: convertLegacyRouteRef(rootRouteRef),
  },
  extensions: [
    PageBlueprint.make({
      params: {
        path: '/ansible',
        title: 'Ansible',
        icon: <AnsibleLogo />,
        routeRef: convertLegacyRouteRef(rootRouteRef),
        noHeader: true,
        loader: async () => {
          const { AnsiblePage } = await import('./components/AnsiblePage');
          return compatWrapper(<AnsiblePage />);
        },
      },
    }),
    ScaffolderHeaderActionBlueprint.make({
      name: 'sync-now',
      params: {
        component: ScaffolderSyncNow,
        order: 100,
      },
    }),
  ],
});

export default ansiblePlugin;
