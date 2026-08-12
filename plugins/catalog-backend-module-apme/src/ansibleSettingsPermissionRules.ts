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
  createPermissionResourceRef,
  createPermissionRule,
  type PermissionRule,
} from '@backstage/plugin-permission-node';
import { z } from 'zod/v3';
import {
  RESOURCE_TYPE_ANSIBLE_SETTINGS,
  type AnsibleSettingsCapability,
} from '@ansible/backstage-rhaap-common/permissions';

export type AnsibleSettingsResource = {
  capability: AnsibleSettingsCapability;
};

export type AnsibleSettingsFilter = { capability: { $eq: string } };

export type HasCapabilityParams = {
  capability: AnsibleSettingsCapability;
};

export const ansibleSettingsResourceRef = createPermissionResourceRef<
  AnsibleSettingsResource,
  AnsibleSettingsFilter
>().with({
  pluginId: 'catalog',
  resourceType: RESOURCE_TYPE_ANSIBLE_SETTINGS,
});

// Backstage's createPermissionRule + zod/v3 paramsSchema triggers TS2589 in
// the workspace tsc pass; runtime types are correct.
export const hasCapability = createPermissionRule({
  name: 'FOR_CAPABILITY',
  description: 'Match settings mutations by capability area (apme)',
  resourceRef: ansibleSettingsResourceRef,
  paramsSchema: z.object({
    capability: z.literal('apme'),
  }),
  apply: (
    resource: AnsibleSettingsResource,
    { capability }: HasCapabilityParams,
  ) => resource.capability === capability,
  toQuery: ({ capability }: HasCapabilityParams) => ({
    capability: { $eq: capability },
  }),
} as any) as PermissionRule<
  AnsibleSettingsResource,
  AnsibleSettingsFilter,
  typeof RESOURCE_TYPE_ANSIBLE_SETTINGS,
  HasCapabilityParams
>;

export const settingsPermissionRules: PermissionRule<
  AnsibleSettingsResource,
  AnsibleSettingsFilter,
  typeof RESOURCE_TYPE_ANSIBLE_SETTINGS,
  HasCapabilityParams
>[] = [hasCapability];
