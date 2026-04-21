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
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { apmeApiRef, ApmeApiClient } from './api';

export const apmePlugin = createPlugin({
  id: 'apme',
  apis: [
    createApiFactory({
      api: apmeApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new ApmeApiClient({ discoveryApi, fetchApi }),
    }),
  ],
});

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
