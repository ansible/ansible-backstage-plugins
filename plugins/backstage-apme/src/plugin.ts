/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  createPlugin,
  createComponentExtension,
  createRoutableExtension,
  createRouteRef,
} from '@backstage/core-plugin-api';
import { apmeApiFactory } from './api/apmeApiFactory';

export const rootRouteRef = createRouteRef({
  id: 'apme',
});

export const projectRouteRef = createRouteRef({
  id: 'apme-project',
  params: ['projectId'],
});

export const apmePlugin = createPlugin({
  id: 'apme',
  routes: {
    root: rootRouteRef,
    project: projectRouteRef,
  },
  apis: [apmeApiFactory],
});

export const ApmePage = apmePlugin.provide(
  createRoutableExtension({
    name: 'ApmePage',
    component: () => import('./components/ApmePage').then(m => m.ApmePage),
    mountPoint: rootRouteRef,
  }),
);

export const ApmeProjectPage = apmePlugin.provide(
  createRoutableExtension({
    name: 'ApmeProjectPage',
    component: () =>
      import('./components/ProjectDetailPage').then(m => m.ProjectDetailPage),
    mountPoint: projectRouteRef,
  }),
);

export const ApmeHealthCard = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeHealthCard',
    component: {
      lazy: () =>
        import('./components/ApmeHealthCard').then(m => m.ApmeHealthCard),
    },
  }),
);

export const ApmeViolationsTable = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeViolationsTable',
    component: {
      lazy: () =>
        import('./components/ApmeViolationsTable').then(
          m => m.ApmeViolationsTable,
        ),
    },
  }),
);

export const ApmeEntityTab = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeEntityTab',
    component: {
      lazy: () =>
        import('./components/ApmeEntityTab').then(m => m.ApmeEntityTab),
    },
  }),
);

export const ApmeRepoStatusChip = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeRepoStatusChip',
    component: {
      lazy: () =>
        import('./components/ApmeRepoStatusChip').then(
          m => m.ApmeRepoStatusChip,
        ),
    },
  }),
);

export const ApmeAdminCard = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeAdminCard',
    component: {
      lazy: () =>
        import('./components/ApmeAdminCard').then(m => m.ApmeAdminCard),
    },
  }),
);

export const ApmeEnabledEntityLayoutRoute = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeEnabledEntityLayoutRoute',
    component: {
      lazy: () =>
        import('./components/ApmeEnabledEntityLayoutRoute').then(
          m => m.ApmeEnabledEntityLayoutRoute,
        ),
    },
  }),
);

export const ApmeQualitySettingsTab = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeQualitySettingsTab',
    component: {
      lazy: () =>
        import('./components/ApmeQualitySettingsTab').then(
          m => m.ApmeQualitySettingsTab,
        ),
    },
  }),
);

export const ApmeFleetQualityTab = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeFleetQualityTab',
    component: {
      lazy: () =>
        import('./components/FleetQualityTab').then(m => m.FleetQualityTab),
    },
  }),
);

export const QualityTabExtension = apmePlugin.provide(
  createComponentExtension({
    name: 'QualityTab',
    component: {
      lazy: () => import('./components/QualityTab').then(m => m.QualityTab),
    },
  }),
);
