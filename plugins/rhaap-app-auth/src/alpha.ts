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
import { createElement } from 'react';
import {
  ApiBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import type { SignInPageProps } from '@backstage/plugin-app-react';
import { compatWrapper } from '@backstage/core-compat-api';
import { AapAuthApi } from '@ansible/plugin-backstage-self-service';

/**
 * RHAAP OAuth2 Utility API, reusing the exact same `ApiFactory` that
 * `self-service` registers for RHDH 1.10 (legacy) so there is a single
 * source of truth for the RHAAP auth API regardless of which Backstage
 * frontend system loads it.
 */
const rhaapAuthApi = ApiBlueprint.make({
  name: 'rhaap-auth',
  params: define => define(AapAuthApi),
});

/**
 * RHAAP sign-in page extension.
 *
 * `SignInPageBlueprint` is documented as "limited to use by the app
 * plugin" — its extension attaches to `app/root`'s `signInPage` input,
 * which is `internal: true`. Only extensions belonging to the `app`
 * plugin can fill it, which is why this whole module targets
 * `pluginId: 'app'` below instead of a plugin-specific id.
 *
 * The legacy `SignInPage` component (from `@backstage/core-plugin-api` /
 * `@backstage/core-components`) is wrapped with `compatWrapper` so its
 * legacy `useApi` calls resolve correctly inside the NFS app tree.
 */
const signInPage = SignInPageBlueprint.make({
  params: {
    loader: () =>
      import('./components/SignInPage').then(
        m => (props: SignInPageProps) =>
          compatWrapper(createElement(m.SignInPage, props)),
      ),
  },
});

/**
 * RHAAP sign-in page + OAuth2 API, registered against the `app` plugin.
 *
 * This package is RHDH 2.1 (NFS/Module Federation)-only. RHDH 1.10
 * (Scalprum) loads it as a harmless no-op — no `pluginConfig` references
 * it, and the sign-in page on RHDH 1.10 continues to come from
 * `self-service`'s `SignInPage` named export via
 * `signInPage.importName: SignInPage`.
 *
 * Default-exported for dynamic frontend loading (Module Federation).
 */
export default createFrontendModule({
  pluginId: 'app',
  extensions: [signInPage, rhaapAuthApi],
});
