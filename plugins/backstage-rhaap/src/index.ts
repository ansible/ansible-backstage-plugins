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

import {
  analyticsApiRef,
  configApiRef,
  createApiFactory,
  identityApiRef,
} from '@backstage/core-plugin-api';

import { AnsibleSegmentAnalytics } from './apis/implementations/AnalyticsApi';

export { ansiblePlugin, AnsiblePage } from './plugin';
export { AnsibleLogo } from './components/AnsibleLogo';

export * from './apis/implementations/AnalyticsApi';
export const AnsibleSegmentAnalyticsApi = createApiFactory({
  api: analyticsApiRef,
  deps: { configApi: configApiRef, identityApi: identityApiRef },
  factory: ({ configApi, identityApi }) =>
    AnsibleSegmentAnalytics.fromConfig(configApi, identityApi),
});
