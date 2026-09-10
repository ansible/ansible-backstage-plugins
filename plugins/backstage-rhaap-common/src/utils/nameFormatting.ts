/*
 * Copyright 2024 The Backstage Authors
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

/**
 * Canonical AAP name to Backstage entity name/namespace sanitization.
 *
 * This is the single source of truth for converting AAP organization
 * and team names into valid Backstage entity identifiers.
 *
 * Used by:
 * - Bulk sync (organizations, teams)
 * - Single-user onboarding
 * - Config validation
 * - API client lookups
 *
 * @see AAP-91915 - Three incompatible sanitizers consolidated into one
 */

const BACKSTAGE_NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_NAME_LENGTH = 63;

/**
 * Sanitizes an AAP name (organization or team) into a valid Backstage
 * entity name or namespace.
 *
 * Rules (matching Backstage requirements):
 * 1. Convert to lowercase
 * 2. Convert underscores, spaces, and slashes to hyphens
 * 3. Remove all other non-alphanumeric characters except hyphens
 * 4. Collapse multiple consecutive hyphens into a single hyphen
 * 5. Remove leading and trailing hyphens
 * 6. Truncate to 63 characters maximum
 * 7. Re-trim trailing hyphen if truncation created one
 *
 * @param name - The AAP organization or team name to sanitize
 * @returns Valid Backstage entity name/namespace
 * @throws Error if the sanitized result is empty or invalid
 *
 * @example
 * sanitizeAapName('Dev_Ops')        // => 'dev-ops'
 * sanitizeAapName('QA-Team!')       // => 'qa-team'
 * sanitizeAapName('My Team')        // => 'my-team'
 * sanitizeAapName('Test___Org')     // => 'test-org'
 * sanitizeAapName('---Edge---')     // => 'edge'
 */
export function sanitizeAapName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error(
      `AAP name must be a non-empty string, received: ${JSON.stringify(name)}`,
    );
  }

  const sanitized = name
    .toLowerCase() // 1. Lowercase
    .replaceAll(/[_\s/]+/g, '-') // 2. Underscores, spaces, slashes → hyphen
    .replaceAll(/[^a-z0-9-]/g, '') // 3. Remove all non-alphanumeric except hyphens
    .replaceAll(/-+/g, '-') // 4. Collapse multiple hyphens
    .replaceAll(/^-|-$/g, '') // 5. Trim leading/trailing hyphens
    .slice(0, MAX_NAME_LENGTH) // 6. Truncate to max length
    .replace(/-$/, ''); // 7. Re-trim trailing hyphen if truncation created one

  if (!sanitized) {
    throw new Error(
      `AAP name "${name}" contains no valid characters for Backstage entity conversion. ` +
        `Names must contain at least one alphanumeric character.`,
    );
  }

  if (!BACKSTAGE_NAME_REGEX.test(sanitized)) {
    throw new Error(
      `AAP name "${name}" produced invalid Backstage identifier "${sanitized}". ` +
        `Names must match ${BACKSTAGE_NAME_REGEX} (lowercase alphanumeric with hyphens, ` +
        `must start and end with alphanumeric).`,
    );
  }

  return sanitized;
}
