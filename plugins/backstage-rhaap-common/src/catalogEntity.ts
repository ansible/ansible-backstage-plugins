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

import { Entity } from '@backstage/catalog-model';

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

/** Normalizes a clone URL for project lookup (strips trailing slashes, .git suffix, lowercases host). */
export function normalizeRepoUrl(repoUrl: string): string {
  let value = stripTrailingSlashes(repoUrl.trim());
  if (value.endsWith('.git')) {
    value = value.slice(0, -4);
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = stripTrailingSlashes(url.pathname);
    return `https://${host}${path}`;
  } catch {
    return value;
  }
}

/** Derives a default project name from org/repo in a clone URL. */
export function projectNameFromRepoUrl(repoUrl: string): string {
  const normalized = normalizeRepoUrl(repoUrl);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length >= 2) {
    return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
  }
  return segments[segments.length - 1] ?? 'repository';
}

/** Normalizes a raw annotation value to a repository root URL. */
export function normalizeSourceLocation(sourceLocation: string): string | null {
  let value = sourceLocation.trim();
  if (value.startsWith('url:')) {
    value = value.slice(4).trim();
  }

  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return normalizeRepoUrl(
        `${url.protocol}//${url.host}/${segments[0]}/${segments[1]}`,
      );
    }
    return normalizeRepoUrl(`${url.protocol}//${url.host}${url.pathname}`);
  } catch {
    if (value.includes('/')) {
      const [org, repo] = value.split('/');
      if (org && repo) {
        return normalizeRepoUrl(
          `https://github.com/${org}/${repo.split('/')[0]}`,
        );
      }
    }
    return null;
  }
}

/** Normalizes catalog annotations to a clone URL for project matching. */
export function normalizeRepoUrlFromEntity(entity: Entity): string | null {
  const annotations = entity.metadata.annotations ?? {};
  const sourceLocation = annotations['backstage.io/source-location'];
  if (sourceLocation) {
    return normalizeSourceLocation(sourceLocation);
  }

  const projectSlug = annotations['github.com/project-slug'];
  if (projectSlug) {
    return normalizeRepoUrl(`https://github.com/${projectSlug}`);
  }

  const scmHost = annotations['ansible.io/scm-host'];
  const scmOrg = annotations['ansible.io/scm-organization'];
  const scmRepo = annotations['ansible.io/scm-repository'];
  if (scmHost && scmOrg && scmRepo) {
    const host = scmHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return normalizeRepoUrl(`https://${host}/${scmOrg}/${scmRepo}`);
  }

  return null;
}

/** Reads default branch from a git-repository catalog entity. */
export function defaultBranchFromEntity(entity: Entity): string {
  const spec = entity.spec as
    { repository_default_branch?: string } | undefined;
  return spec?.repository_default_branch ?? 'main';
}

/** SCM organization annotation used for bulk sync scope filtering. */
export function scmOrganizationFromEntity(entity: Entity): string | undefined {
  return entity.metadata.annotations?.['ansible.io/scm-organization'];
}
