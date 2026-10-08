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
import type { SignInPageProps } from '@backstage/plugin-app-react';
import { SignInPage as CoreSignInPage } from '@backstage/core-components';
import { rhAapAuthApiRef } from '@ansible/plugin-backstage-self-service';

/**
 * RHAAP sign-in page for the Backstage New Frontend System (RHDH 2.1+).
 *
 * Registered via `SignInPageBlueprint` in ./alpha.ts, which may only be
 * provided by a `FrontendModule` targeting `pluginId: 'app'` — see the
 * "Critical Constraint: Sign-In Page" section of the migration plan for why
 * this lives in its own package rather than in `self-service`.
 *
 * This reuses the same `rhAapAuthApiRef` / `AapAuthApi` factory that
 * `self-service` exports for RHDH 1.10 (legacy) so that both the legacy
 * `SignInPage` (plugins/self-service/src/components/SignInPage) and this
 * NFS sign-in page authenticate against the exact same Utility API.
 */
export function SignInPage(props: SignInPageProps): React.JSX.Element {
  return (
    <CoreSignInPage
      {...props}
      align="center"
      title="Select a Sign-in method"
      auto
      providers={[
        {
          id: 'rhaap',
          title: 'Ansible Automation Platform',
          message: 'Sign in using Ansible Automation Platform',
          apiRef: rhAapAuthApiRef,
        },
      ]}
    />
  );
}
