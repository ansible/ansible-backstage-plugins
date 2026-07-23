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
  createRouteRef,
} from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'apme',
});

/**
 * API factories are registered by the composition root, not createPlugin:
 * - Monolith: packages/app/src/apis.ts (apmeApiFactory)
 * - RHDH/OCI: dynamicPlugins apiFactories (apmeApiFactory)
 */
export const apmePlugin = createPlugin({
  id: 'apme',
  routes: {
    root: rootRouteRef,
  },
});

export const ApmeEntityTab = apmePlugin.provide(
  createComponentExtension({
    name: 'ApmeEntityTab',
    component: {
      lazy: () =>
        import('./components/ApmeEntityTab').then(m => m.ApmeEntityTab),
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

export const QualityTabExtension = apmePlugin.provide(
  createComponentExtension({
    name: 'QualityTab',
    component: {
      lazy: () => import('./components/QualityTab').then(m => m.QualityTab),
    },
  }),
);
