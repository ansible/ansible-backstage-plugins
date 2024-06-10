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

import { Config } from '@backstage/config';

export type AnsibleDetails = {
  devSpacesBaseUrl: string;
  port?: number;
  baseUrl?: string;
};

function generateInitUrl(baseUrl: string, port: number): string {
  return `http://${baseUrl}:${port}/`;
}

function generateDevSpacesUrl(
  devSpacesBaseUrl: string,
  repoOwner: string,
  repoName: string,
): string {
  return `${devSpacesBaseUrl}#https://github.com/${repoOwner}/${repoName}`;
}

export function generateRepoUrl(repoOwner: string, repoName: string): string {
  return `github.com?owner=${repoOwner}&repo=${repoName}`;
}

export const getAnsibleConfig = (config: Config): AnsibleDetails => {
  return {
    devSpacesBaseUrl: config.getString('ansible.devSpacesBaseUrl'),
    baseUrl: config.getString('ansible.creatorService.baseUrl'),
    port: Number(config.getString('ansible.creatorService.port')),
  };
};

export const getAllAnsibleConfig = (config: Config): AnsibleDetails => {
  return getAnsibleConfig(config);
};

export const getDevSpacesUrlFromAnsibleConfig = (config: Config): string => {
  return config.getString('ansible.devSpacesBaseUrl');
};

export const getServiceUrlFromAnsibleConfig = (config: Config): string => {
  return generateInitUrl(
    config.getString('ansible.creatorService.baseUrl'),
    Number(config.getString('ansible.creatorService.port')),
  );
};

export const getDevspacesUrlFromAnsibleConfig = (
  config: Config,
  repoOwner: string,
  repoName: string,
): string => {
  return generateDevSpacesUrl(
    config.getString('ansible.devSpacesBaseUrl'),
    repoOwner,
    repoName,
  );
};

export const validateAnsibleConfig = (config: Config) => {
  if (!config.has('ansible.creatorService.baseUrl')) {
    throw new Error(
      'Missing required configuration: ansible.creatorService.baseUrl',
    );
  }

  if (!config.has('ansible.creatorService.port')) {
    throw new Error(
      'Missing required configuration: ansible.creatorService.port',
    );
  }

};
