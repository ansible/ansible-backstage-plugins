/*
 * Copyright 2025 The Ansible plugin Authors
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
     * Configuration for Openshift Dev Spaces Dashboard
     * @visibility backend
     */
    devSpaces?: {
      /**
       * The base URL for Dev Spaces
       * @visibility backend
       */
      baseUrl?: string;
    };
    /**
     * Configuration for Automation Hub
     * @visibility backend
     */
    automationHub?: {
      /**
       * The base URL for Automation Hub
       * @visibility backend
       */
      baseUrl?: string;
    };
    /**
     * Configuration for RHAAP (Red Hat Ansible Automation Platform)
     * @visibility backend
     */
    rhaap?: {
      /**
       * The base URL for RHAAP
       * @visibility backend
       */
      baseUrl?: string;
      /**
       * Authentication token for RHAAP
       * @visibility backend
       */
      token?: string;
      /**
       * Whether to check SSL certificates
       * @visibility backend
       */
      checkSSL?: boolean;
      /**
       * Configuration for showcase location
       * @visibility backend
       */
      showCaseLocation?: {
        /**
         * Type of showcase location ('url' or 'file')
         * @visibility backend
         */
        type?: 'url' | 'file';
        /**
         * Target location for the showcase
         * @visibility backend
         */
        target?: string;
        /**
         * Git branch for the showcase
         * @visibility backend
         */
        gitBranch?: string;
        /**
         * Git user for the showcase
         * @visibility backend
         */
        gitUser?: string;
        /**
         * Git email for the showcase
         * @visibility backend
         */
        gitEmail?: string;
      };
    };
    /**
     * Configuration for the creator service
     * @visibility backend
     */
    creatorService?: {
      /**
       * Base URL for the creator service
       * @visibility backend
       */
      baseUrl?: string;
      /**
       * Port for the creator service
       * @visibility backend
       */
      port?: string;
    };
  };
  /**
   * Configuration for catalog providers
   * @visibility backend
   */
  catalog?: {
    providers?: {
      rhaap?: {
        [authEnv: string]: {
          orgs: string;
        };
      };
    };
  };
}
