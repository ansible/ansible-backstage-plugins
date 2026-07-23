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

export interface Config {
  ansible?: {
    /**
     * @deepVisibility frontend
     */
    devSpaces?: {
      /**
       * OpenShift Dev Spaces dashboard base URL.
       * @visibility frontend
       */
      baseUrl?: string;
    };
    apme?: {
      /**
       * When false, the plugin registers no routes, sidebar, or UI surfaces.
       * @visibility frontend
       */
      enabled?: boolean;
      /**
       * APME Gateway base URL (e.g. http://localhost:8080).
       * @visibility frontend
       */
      baseUrl?: string;
      /** @visibility frontend */
      checkSSL?: boolean;
      /**
       * Use mock data instead of real APME gateway.
       * @visibility frontend
       */
      mockMode?: boolean;
      /**
       * Enable AI-assisted remediation tier in scans and UI labels.
       * Defaults to false when omitted (ADR-011).
       * @default false
       * @visibility frontend
       */
      enableAi?: boolean;
      /**
       * When true, PR creation is proxied to the APME gateway SCM submit path (ADR-050).
       * @default true
       * @visibility frontend
       */
      publishViaGateway?: boolean;
      /**
       * Timeout in milliseconds for remediation submit / push branch / create PR.
       * Large remedia pushes may need longer than the default short HTTP timeout.
       * @default 300000
       * @visibility frontend
       */
      submitTimeoutMs?: number;
      /**
       * Default ansible-core scan target for quality scans (Helm / app-config).
       * Shown read-only in Quality Settings; not editable in the portal UI.
       * @visibility frontend
       */
      targetAnsibleCoreVersion?: string;
      /**
       * Early-access feedback form URL. Omit for default EAP form; set "" to hide link.
       * @default https://forms.gle/VUvfyTjnVax83GPt6
       * @visibility frontend
       */
      feedbackFormUrl?: string;
    };
  };
}
