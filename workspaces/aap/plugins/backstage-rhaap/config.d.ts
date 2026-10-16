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

export interface Config {
  /** Configurations for the Ansible plugin */
  ansible?: {
    /**
     * The devspaces baseUrl for Openshift Dev Spaces Dashboard.
     * @deepVisibility frontend
     */
    devSpaces?: {
      /**
       * @visibility frontend
       */
      baseUrl: string;
    };

    /**
     * @deepVisibility frontend
     */
    automationHub?: {
      /**
       * @visibility frontend
       */
      baseUrl: string;
    };

    /**
     * @deepVisibility frontend
     */
    rhaap?: {
      /**
       * @visibility frontend
       */
      baseUrl: string;
    };

    /**
     * Feedback form configuration
     * @deepVisibility frontend
     */
    feedback?: {
      /**
       * Enable or disable the feedback form. Defaults to true.
       * @visibility frontend
       */
      enabled?: boolean;
    };
  };
}
