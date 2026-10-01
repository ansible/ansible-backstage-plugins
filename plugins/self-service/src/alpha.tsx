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
 * This file is loaded via the `./alpha` package export (Module
 * Federation). It is purely additive: `src/index.ts` (the RHDH 1.10 /
 * Scalprum legacy entry point) is left completely untouched, and both
 * entry points ship in the same exported dynamic plugin bundle. See the
 * "Dual-Compatibility Strategy" section of rhdh-2.1-migration-plan.md.
 *
 * Every page/element loader below wraps the *existing* legacy component
 * tree with `compatWrapper` from `@backstage/core-compat-api`, rather
 * than rewriting components to be NFS-native. This means the legacy
 * components keep using `useApi`, `useRouteRef`, `usePermission`, etc.
 * from `@backstage/core-plugin-api` unchanged, while still rendering
 * correctly inside an NFS app tree.
 */
import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import type { FrontendPlugin } from '@backstage/frontend-plugin-api';
import {
  ApiBlueprint,
  AppRootElementBlueprint,
  PageBlueprint,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';
import {
  FormFieldBlueprint,
  createFormField,
} from '@backstage/plugin-scaffolder-react/alpha';
import HomeIcon from '@material-ui/icons/Home';
import BuildIcon from '@material-ui/icons/Build';
import ExtensionIcon from '@material-ui/icons/Extension';
import GitHubIcon from '@material-ui/icons/GitHub';
import HistoryIcon from '@material-ui/icons/History';

import { AAPApis, EEBuildApis } from './apis';
import {
  rootRouteRef,
  eeRouteRef,
  collectionsRouteRef,
  gitRepositoriesRouteRef,
  templatesRouteRef,
  historyRouteRef,
} from './routes';

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const landingPage = PageBlueprint.make({
  name: 'landing',
  params: {
    path: '/',
    loader: () =>
      import('./components/LandingPage').then(m =>
        compatWrapper(<m.LandingPage />),
      ),
  },
});

const selfServiceIndexPage = PageBlueprint.make({
  name: 'self-service-index',
  params: {
    path: '/self-service',
    loader: () =>
      Promise.resolve(
        compatWrapper(<Navigate to="/self-service/catalog" replace />),
      ),
  },
});

// Catalog routes: explicit paths only. A single PageBlueprint at
// `/self-service/*` renders the NFS shell but leaves the outlet empty on RHDH 2.1.
const templatesCatalogPage = PageBlueprint.make({
  name: 'templates-catalog',
  params: {
    path: '/self-service/catalog',
    title: 'Templates',
    icon: <HomeIcon />,
    routeRef: convertLegacyRouteRef(templatesRouteRef),
    loader: () =>
      import('./components/Home').then(m =>
        compatWrapper(<m.TemplatesCatalogPage />),
      ),
  },
});

const templateDetailPage = PageBlueprint.make({
  name: 'template-detail',
  params: {
    path: '/self-service/catalog/:namespace/:templateName',
    loader: () =>
      import('./components/Home').then(m =>
        compatWrapper(<m.TemplateDetailPage />),
      ),
  },
});

const templateCreatePage = PageBlueprint.make({
  name: 'template-create',
  params: {
    path: '/self-service/create/templates/:namespace/:templateName',
    loader: () =>
      import('./components/Home').then(m =>
        compatWrapper(<m.TemplateCreatePage />),
      ),
  },
});

const eeIndexPage = PageBlueprint.make({
  name: 'ee-index',
  params: {
    path: '/self-service/ee',
    loader: () =>
      Promise.resolve(
        compatWrapper(<Navigate to="/self-service/ee/catalog" replace />),
      ),
  },
});

const eeCatalogPage = PageBlueprint.make({
  name: 'ee-catalog',
  params: {
    path: '/self-service/ee/catalog',
    title: 'Execution Environments',
    icon: <BuildIcon />,
    routeRef: convertLegacyRouteRef(eeRouteRef),
    loader: () =>
      import('./components/ExecutionEnvironments').then(m =>
        compatWrapper(<m.EESectionPage />),
      ),
  },
});

const eeCreatePage = PageBlueprint.make({
  name: 'ee-create',
  params: {
    path: '/self-service/ee/create',
    loader: () =>
      import('./components/ExecutionEnvironments').then(m =>
        compatWrapper(<m.EESectionPage />),
      ),
  },
});

const collectionsListPage = PageBlueprint.make({
  name: 'collections-list',
  params: {
    path: '/self-service/collections',
    title: 'Collections',
    icon: <ExtensionIcon />,
    routeRef: convertLegacyRouteRef(collectionsRouteRef),
    loader: () =>
      import('./components/CollectionsCatalog').then(m =>
        compatWrapper(<m.CollectionsSectionPage />),
      ),
  },
});

const collectionDetailPage = PageBlueprint.make({
  name: 'collection-detail',
  params: {
    path: '/self-service/collections/:collectionName',
    loader: () =>
      import('./components/CollectionsCatalog').then(m =>
        compatWrapper(<m.CollectionsSectionPage />),
      ),
  },
});

const gitRepositoriesIndexPage = PageBlueprint.make({
  name: 'git-repositories-index',
  params: {
    path: '/self-service/repositories',
    loader: () =>
      Promise.resolve(
        compatWrapper(
          <Navigate to="/self-service/repositories/catalog" replace />,
        ),
      ),
  },
});

const gitRepositoriesCatalogPage = PageBlueprint.make({
  name: 'git-repositories-catalog',
  params: {
    path: '/self-service/repositories/catalog',
    title: 'Git Repositories',
    icon: <GitHubIcon />,
    routeRef: convertLegacyRouteRef(gitRepositoriesRouteRef),
    loader: () =>
      import('./components/GitRepositories').then(m =>
        compatWrapper(<m.GitRepositoriesSectionPage />),
      ),
  },
});

const gitRepositoriesCIPage = PageBlueprint.make({
  name: 'git-repositories-ci',
  params: {
    path: '/self-service/repositories/ci-activity',
    loader: () =>
      import('./components/GitRepositories').then(m =>
        compatWrapper(<m.GitRepositoriesSectionPage />),
      ),
  },
});

const gitRepositoryDetailPage = PageBlueprint.make({
  name: 'git-repository-detail',
  params: {
    path: '/self-service/repositories/:repositoryName',
    loader: () =>
      import('./components/GitRepositories').then(m =>
        compatWrapper(<m.GitRepositoriesSectionPage />),
      ),
  },
});

const historyPage = PageBlueprint.make({
  name: 'history',
  params: {
    path: '/self-service/create/tasks',
    title: 'History',
    icon: <HistoryIcon />,
    routeRef: convertLegacyRouteRef(historyRouteRef),
    loader: () =>
      import('./components/TaskList').then(m =>
        compatWrapper(<m.HistoryRoutesPage />),
      ),
  },
});

// ---------------------------------------------------------------------------
// APIs
//
// Note: the RHAAP OAuth2 API (`AapAuthApi` / `rhAapAuthApiRef`) is
// intentionally *not* registered here. It is registered once, by the
// `rhaap-app-auth` package's `pluginId: 'app'` module, alongside the
// sign-in page it authenticates — see the "Critical Constraint:
// Sign-In Page" section of rhdh-2.1-migration-plan.md. `AapAuthApi` is
// still exported from ./apis.ts (via src/index.ts) for RHDH 1.10.
// ---------------------------------------------------------------------------

const ansibleApi = ApiBlueprint.make({
  name: 'ansible',
  params: define => define(AAPApis),
});

const eeBuildApi = ApiBlueprint.make({
  name: 'ee-build',
  params: define => define(EEBuildApis),
});

// ---------------------------------------------------------------------------
// Scaffolder form field extensions
//
// The `name` passed to `createFormField` intentionally matches the
// legacy `createScaffolderFieldExtension` name 1:1 — templates reference
// fields by this name via `ui:field: <Name>` in template YAML, and that
// wiring must keep working identically on both RHDH 1.10 and 2.1.
// ---------------------------------------------------------------------------

const aapTokenField = FormFieldBlueprint.make({
  name: 'aap-token-field',
  params: {
    field: () =>
      import(
        './components/Scaffolder/AAPTokenField/AAPTokenFieldExtension'
      ).then(m =>
        createFormField({
          name: 'AAPTokenField',
          component: m.AAPTokenField,
          // Note: the legacy `CustomFieldExtensionSchema` produced by
          // `makeFieldSchema()` (stable `@backstage/plugin-scaffolder-react`)
          // is not structurally compatible with the alpha `FieldSchema` type
          // expected here, so it is intentionally omitted for the NFS
          // registration. The legacy `extensions.ts` registration (RHDH 1.10)
          // is untouched and keeps its `schema` for authoring-time validation.
        }),
      ),
  },
});

const aapResourcePickerField = FormFieldBlueprint.make({
  name: 'aap-resource-picker-field',
  params: {
    field: () =>
      import('./components/Scaffolder/AAResourcePicker/AAPResourcePicker').then(
        m =>
          createFormField({
            name: 'AAPResourcePicker',
            component: m.AAPResourcePicker,
          }),
      ),
  },
});

const baseImagePickerField = FormFieldBlueprint.make({
  name: 'base-image-picker-field',
  params: {
    field: () =>
      import(
        './components/Scaffolder/BaseImagePicker/BaseImagePickerExtension'
      ).then(m =>
        createFormField({
          name: 'BaseImagePicker',
          component: m.BaseImagePickerExtension,
        }),
      ),
  },
});

const collectionsPickerField = FormFieldBlueprint.make({
  name: 'collections-picker-field',
  params: {
    field: () =>
      import(
        './components/Scaffolder/CollectionsPicker/CollectionsPickerExtension'
      ).then(m =>
        createFormField({
          name: 'CollectionsPicker',
          component: m.CollectionsPickerExtension,
        }),
      ),
  },
});

const fileUploadPickerField = FormFieldBlueprint.make({
  name: 'file-upload-picker-field',
  params: {
    field: () =>
      import(
        './components/Scaffolder/FileUploadPicker/FileUploadPickerExtension'
      ).then(m =>
        createFormField({
          name: 'FileUploadPicker',
          component: m.FileUploadPickerExtension,
        }),
      ),
  },
});

const packagesPickerField = FormFieldBlueprint.make({
  name: 'packages-picker-field',
  params: {
    field: () =>
      import(
        './components/Scaffolder/PackagesPicker/PackagesPickerExtension'
      ).then(m =>
        createFormField({
          name: 'PackagesPicker',
          component: m.PackagesPickerExtension,
        }),
      ),
  },
});

const mcpServersPickerField = FormFieldBlueprint.make({
  name: 'mcp-servers-picker-field',
  params: {
    field: () =>
      import(
        './components/Scaffolder/MCPServersPicker/MCPServersPickerExtension'
      ).then(m =>
        createFormField({
          name: 'MCPServersPicker',
          component: m.MCPServersPickerExtension,
        }),
      ),
  },
});

const additionalBuildStepsPickerField = FormFieldBlueprint.make({
  name: 'additional-build-steps-picker-field',
  params: {
    field: () =>
      import(
        './components/Scaffolder/AdditionalBuildStepsPicker/AdditionalBuildStepsPickerExtension'
      ).then(m =>
        createFormField({
          name: 'AdditionalBuildStepsPicker',
          component: m.AdditionalBuildStepsPickerExtension,
        }),
      ),
  },
});

const eeFileNamePickerField = FormFieldBlueprint.make({
  name: 'ee-file-name-picker-field',
  params: {
    field: () =>
      import(
        './components/Scaffolder/EEFileNamePicker/EEFileNamePickerExtension'
      ).then(m =>
        createFormField({
          name: 'EEFileNamePicker',
          component: m.EEFileNamePickerExtension,
        }),
      ),
  },
});

const eeTagsPickerField = FormFieldBlueprint.make({
  name: 'ee-tags-picker-field',
  params: {
    field: () =>
      import('./components/Scaffolder/EETagsPicker/EETagsPickerExtension').then(
        m =>
          createFormField({
            name: 'EETagsPicker',
            component: m.EETagsPickerExtension,
          }),
      ),
  },
});

const scmSelectorField = FormFieldBlueprint.make({
  name: 'scm-selector-field',
  params: {
    field: () =>
      import('./components/Scaffolder/ScmSelector/ScmSelectorExtension').then(
        m =>
          createFormField({
            name: 'ScmSelector',
            component: m.ScmSelectorExtension,
          }),
      ),
  },
});

// ---------------------------------------------------------------------------
// App-root elements
//
// AAPLogoutButton (legacy mountPoint: global.header/profile) has no
// direct NFS equivalent yet and is intentionally not registered here —
// see the "investigate-logout-button" follow-up.
// ---------------------------------------------------------------------------

const LazyLocationListener = lazy(() =>
  import('./components/LocationListener').then(m => ({
    default: m.LocationListener,
  })),
);

const locationListenerElement = AppRootElementBlueprint.make({
  name: 'location-listener',
  params: {
    element: compatWrapper(
      <Suspense fallback={null}>
        <LazyLocationListener />
      </Suspense>,
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

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

// Explicit type annotation avoids TS2742 ("inferred type of 'default' cannot
// be named without a reference to ... this is likely not portable"), caused
// by multiple hoisted copies of @backstage/frontend-plugin-api in the yarn
// tree. Annotating the exported const with the public `FrontendPlugin` type
// sidesteps the need for TS to structurally name the anonymous inferred type.
const selfServicePlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'self-service',
  routes: {
    root: convertLegacyRouteRef(rootRouteRef),
    ee: convertLegacyRouteRef(eeRouteRef),
    collections: convertLegacyRouteRef(collectionsRouteRef),
    gitRepositories: convertLegacyRouteRef(gitRepositoriesRouteRef),
    templates: convertLegacyRouteRef(templatesRouteRef),
    history: convertLegacyRouteRef(historyRouteRef),
  },
  extensions: [
    landingPage,
    selfServiceIndexPage,
    templatesCatalogPage,
    templateDetailPage,
    templateCreatePage,
    eeIndexPage,
    eeCatalogPage,
    eeCreatePage,
    collectionsListPage,
    collectionDetailPage,
    gitRepositoriesIndexPage,
    gitRepositoriesCatalogPage,
    gitRepositoriesCIPage,
    gitRepositoryDetailPage,
    historyPage,
    ansibleApi,
    eeBuildApi,
    aapTokenField,
    aapResourcePickerField,
    baseImagePickerField,
    collectionsPickerField,
    fileUploadPickerField,
    packagesPickerField,
    mcpServersPickerField,
    additionalBuildStepsPickerField,
    eeFileNamePickerField,
    eeTagsPickerField,
    scmSelectorField,
    locationListenerElement,
    appThemeFixerElement,
  ],
});

export default selfServicePlugin;
