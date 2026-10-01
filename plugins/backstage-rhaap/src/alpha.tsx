/*
 * Copyright 2024 The Ansible plugin Authors
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

/**
 * Backstage New Frontend System (NFS) entry point for RHDH 2.1+.
 *
 * Purely additive: `src/index.ts` / `src/plugin.ts` (the RHDH 1.10 /
 * Scalprum legacy entry point) are left completely untouched. See the
 * "Dual-Compatibility Strategy" section of rhdh-2.1-migration-plan.md.
 */
import { lazy, Suspense } from 'react';
import type { FrontendPlugin } from '@backstage/frontend-plugin-api';
import {
  AppRootElementBlueprint,
  PageBlueprint,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';

import { rootRouteRef } from './routes';

const ansiblePage = PageBlueprint.make({
  name: 'ansible',
  params: {
    path: '/ansible',
    routeRef: convertLegacyRouteRef(rootRouteRef),
    loader: () =>
      import('./components/AnsiblePage').then(m =>
        compatWrapper(<m.AnsiblePage />),
      ),
  },
});

const LazyAppThemeFixer = lazy(() =>
  import('./components/AppThemeFixer').then(m => ({
    default: m.AppThemeFixer,
  })),
);

const appThemeFixerElement = AppRootElementBlueprint.make({
  name: 'app-theme-fixer',
  params: {
    element: compatWrapper(
      <Suspense fallback={null}>
        <LazyAppThemeFixer />
      </Suspense>,
    ),
  },
});

// Explicit type annotation avoids TS2742 ("inferred type of 'default' cannot
// be named without a reference to ... this is likely not portable"), caused
// by multiple hoisted copies of @backstage/frontend-plugin-api in the yarn
// tree. Annotating the exported const with the public `FrontendPlugin` type
// sidesteps the need for TS to structurally name the anonymous inferred type.
const ansiblePlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'ansible',
  routes: {
    root: convertLegacyRouteRef(rootRouteRef),
  },
  extensions: [ansiblePage, appThemeFixerElement],
});

export default ansiblePlugin;
