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
 * Legacy (RHDH 1.10 / Scalprum) entry point for this package.
 *
 * This package exists solely to register the RHAAP sign-in page and
 * OAuth2 API against the `app` plugin in the Backstage New Frontend
 * System (see ./alpha.ts). RHDH 1.10 has no equivalent extension point
 * for third-party sign-in pages targeting the app plugin itself, so on
 * RHDH 1.10 this package loads via Scalprum (`PluginRoot` -> this file)
 * as a harmless no-op: nothing in `pluginConfig.dynamicPlugins.frontend`
 * references it, and the RHAAP sign-in page on RHDH 1.10 continues to
 * come from `self-service`'s `SignInPage` named export via
 * `signInPage.importName: SignInPage`.
 *
 * The named export below is kept for completeness / potential manual
 * reuse; it is not wired up by any RHDH 1.10 YAML configuration.
 */
export { SignInPage } from './components/SignInPage';
