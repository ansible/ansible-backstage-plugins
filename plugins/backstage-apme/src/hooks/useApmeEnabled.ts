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
import { useAsync } from 'react-use';
import type {
  ApmeAiStatus,
  ApmePortalSettings,
} from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '../api';

let portalSettingsCache: ApmePortalSettings | undefined;
let portalSettingsPromise: Promise<ApmePortalSettings> | undefined;

async function loadPortalSettings(
  apmeApi: { getPortalSettings(): Promise<ApmePortalSettings> },
  configFallback: ApmePortalSettings,
): Promise<ApmePortalSettings> {
  if (portalSettingsCache) {
    return portalSettingsCache;
  }
  if (!portalSettingsPromise) {
    portalSettingsPromise = apmeApi
      .getPortalSettings()
      .then(settings => {
        portalSettingsCache = settings;
        return settings;
      })
      .catch(() => configFallback);
  }
  return portalSettingsPromise;
}

/** Returns whether APME is enabled in app configuration (ADR-011). */
export function useApmeEnabled(): boolean {
  const configApi = useApi(configApiRef);
  return configApi.getOptionalBoolean('ansible.apme.enabled') ?? false;
}

/**
 * Portal AI tier flag — prefers backend app-config (`GET /apme/settings`) over
 * frontend config so UI matches scan/remediate `enable_ai` sent to the gateway.
 */
export function useApmeAiEnabled(): boolean {
  const configApi = useApi(configApiRef);
  const apmeApi = useApi(apmeApiRef);
  const configFallback =
    configApi.getOptionalBoolean('ansible.apme.enableAi') ?? false;
  const { value } = useAsync(
    () =>
      loadPortalSettings(apmeApi, {
        enableAi: configFallback,
        publishViaGateway:
          configApi.getOptionalBoolean('ansible.apme.publishViaGateway') ??
          false,
      }),
    [apmeApi, configFallback, configApi],
  );
  return value?.enableAi ?? configFallback;
}

/** Gateway Abbenay reachability (separate from portal enableAi). */
export function useApmeAiStatus(): {
  status: ApmeAiStatus | undefined;
  loading: boolean;
} {
  const apmeApi = useApi(apmeApiRef);
  const enableAi = useApmeAiEnabled();
  const { value, loading } = useAsync(async () => {
    if (!enableAi) {
      return undefined;
    }
    try {
      return await apmeApi.getAiStatus();
    } catch {
      return { enableAi: true, connected: false, modelCount: 0 };
    }
  }, [apmeApi, enableAi]);
  return { status: value, loading };
}
