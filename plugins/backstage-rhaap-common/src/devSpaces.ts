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

export type ScmRepoParts = {
  sourceControl: string;
  repoOwner: string;
  repoName: string;
};

/** OpenShift Dev Spaces factory URL (shared with scaffolder ansible action). */
export function generateDevSpacesUrl(
  devSpacesBaseUrl: string,
  sourceControl: string,
  repoOwner: string,
  repoName: string,
  branch?: string,
): string {
  const repoPath = branch
    ? `https://${sourceControl}/${repoOwner}/${repoName}/tree/${branch}`
    : `https://${sourceControl}/${repoOwner}/${repoName}`;
  return `${devSpacesBaseUrl}#${repoPath}`;
}

export function parseScmRepoUrl(repoUrl: string): ScmRepoParts | null {
  const normalized = repoUrl
    .replace(/^url:/, '')
    .replace(/\.git$/, '')
    .trim();
  try {
    const absolute = normalized.startsWith('http')
      ? normalized
      : `https://${normalized}`;
    const url = new URL(absolute);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    return {
      sourceControl: url.host,
      repoOwner: parts[0],
      repoName: parts[1],
    };
  } catch {
    return null;
  }
}

export function buildDevSpacesUrlFromRepoUrl(
  devSpacesBaseUrl: string,
  repoUrl: string,
  branch?: string,
): string | null {
  const parts = parseScmRepoUrl(repoUrl);
  if (!parts) {
    return null;
  }
  return generateDevSpacesUrl(
    devSpacesBaseUrl,
    parts.sourceControl,
    parts.repoOwner,
    parts.repoName,
    branch,
  );
}

export function getDevspacesUrlFromAnsibleConfig(
  config: Config,
  sourceControl: string,
  repoOwner: string,
  repoName: string,
): string {
  try {
    return generateDevSpacesUrl(
      config.getString('ansible.devSpaces.baseUrl'),
      sourceControl,
      repoOwner,
      repoName,
    );
  } catch {
    return '';
  }
}
