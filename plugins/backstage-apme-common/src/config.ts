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

import { Config } from '@backstage/config';
import { ApmeConfig } from './types';
import { DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION } from './scanTargetDefaults';

export { DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION } from './scanTargetDefaults';

/** Default timeout for remediation submit/push/PR (5 minutes). */
export const DEFAULT_APME_SUBMIT_TIMEOUT_MS = 300_000;

function resolveSubmitTimeoutMs(raw: number | undefined): number {
  if (raw !== undefined && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_APME_SUBMIT_TIMEOUT_MS;
}

/** Reads APME config from `ansible.apme` (ADR-011). */
export function getApmeConfig(config: Config): ApmeConfig {
  const apmeConfig = config.getOptionalConfig('ansible.apme');

  if (!apmeConfig) {
    return {
      enabled: false,
      baseUrl: 'http://localhost:8080',
      checkSSL: false,
      enableAi: false,
      publishViaGateway: false,
      submitTimeoutMs: DEFAULT_APME_SUBMIT_TIMEOUT_MS,
      targetAnsibleCoreVersion: DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION,
      portalSettingsPath: undefined,
    };
  }

  return {
    enabled: apmeConfig.getOptionalBoolean('enabled') ?? false,
    baseUrl: apmeConfig.getString('baseUrl').replace(/\/+$/, ''),
    checkSSL: apmeConfig.getOptionalBoolean('checkSSL') ?? true,
    enableAi: apmeConfig.getOptionalBoolean('enableAi') ?? false,
    publishViaGateway:
      apmeConfig.getOptionalBoolean('publishViaGateway') ?? true,
    submitTimeoutMs: resolveSubmitTimeoutMs(
      apmeConfig.getOptionalNumber?.('submitTimeoutMs'),
    ),
    targetAnsibleCoreVersion:
      apmeConfig.getOptionalString('targetAnsibleCoreVersion') ??
      DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION,
    portalSettingsPath: apmeConfig.getOptionalString('portalSettingsPath'),
  };
}

/** When true, PR/branch publish is delegated to the APME gateway SCM path. */
export function isApmePublishViaGateway(config: Config): boolean {
  return getApmeConfig(config).publishViaGateway;
}

/** Returns whether AI remediation tier is enabled. Default false when omitted. */
export function isApmeAiEnabled(config: Config): boolean {
  return getApmeConfig(config).enableAi;
}

/** Returns true when the APME plugin is enabled via configuration. */
export function isApmeEnabled(config: Config): boolean {
  return getApmeConfig(config).enabled;
}

/** Returns true when the frontend should use mock fixture data instead of the gateway. */
export function isApmeMockMode(config: Config): boolean {
  return config.getOptionalBoolean('ansible.apme.mockMode') ?? false;
}
