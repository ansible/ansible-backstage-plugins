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

import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { SidebarItem } from '@backstage/core-components';
import SecurityIcon from '@material-ui/icons/Security';

/** Sidebar link for APME — hidden when ansible.apme.enabled is false. */
export const ApmeSidebarItem = () => {
  const configApi = useApi(configApiRef);
  const enabled = configApi.getOptionalBoolean('ansible.apme.enabled') ?? false;

  if (!enabled) {
    return null;
  }

  return (
    <SidebarItem
      icon={SecurityIcon}
      to="/self-service/repositories/quality"
      text="Content Quality"
    />
  );
};
