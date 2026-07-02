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

/** True when an APME API/proxy error indicates the gateway is unreachable. */
export function isApmeConnectionError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('failed to connect to apme') ||
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('network error') ||
    (lower.includes('apme api error') && lower.includes('failed to connect'))
  );
}

export const APME_GATEWAY_UNAVAILABLE_MESSAGE =
  'Unable to reach the APME gateway. Start the gateway (tox -e up in the apme repo) and confirm ansible.apme.baseUrl in app-config.local.yaml.';
