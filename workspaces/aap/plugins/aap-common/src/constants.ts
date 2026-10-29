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

type VersionParts = {
  core: number[];
  /** Null when the version has no prerelease segment (higher precedence). */
  pre: Array<string | number> | null;
};

/**
 * Split a version string into numeric core segments and an optional prerelease.
 * Prerelease identifiers that are purely numeric are compared as numbers;
 * others are compared as strings (semver precedence).
 */
const parseVersion = (version: string): VersionParts => {
  const dash = version.indexOf('-');
  const corePart = dash === -1 ? version : version.slice(0, dash);
  const prePart = dash === -1 ? null : version.slice(dash + 1);

  const core = corePart.split('.').map(p => Number.parseInt(p, 10) || 0);
  const pre =
    prePart === null
      ? null
      : prePart.split('.').map(id => (/^\d+$/.test(id) ? Number(id) : id));

  return { core, pre };
};

const comparePreIdentifiers = (
  a: Array<string | number>,
  b: Array<string | number>,
): number => {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    const leftNum = typeof left === 'number';
    const rightNum = typeof right === 'number';
    if (leftNum && rightNum) return (left as number) - (right as number);
    if (leftNum) return -1;
    if (rightNum) return 1;
    return String(left) < String(right) ? -1 : 1;
  }
  return 0;
};

/**
 * Compare two version strings with semver-like precedence.
 * A release (no prerelease) ranks higher than the same core with a prerelease
 * (e.g. `1.2.3-rc.1` sorts before `1.2.3`).
 */
export const compareVersions = (v1: string, v2: string): number => {
  const a = parseVersion(v1);
  const b = parseVersion(v2);
  const maxLen = Math.max(a.core.length, b.core.length);

  for (let i = 0; i < maxLen; i++) {
    const p1 = a.core[i] || 0;
    const p2 = b.core[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  if (a.pre === null && b.pre === null) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return comparePreIdentifiers(a.pre, b.pre);
};

export const TERMINAL_JOB_STATUSES = new Set([
  'successful',
  'failed',
  'error',
  'canceled',
]);

const data = [
  '0 (Normal)',
  '1 (Verbose)',
  '2 (More Verbose)',
  '3 (Debug)',
  '4 (Connection Debug)',
  '5 (WinRM Debug)',
];

export const getVerbosityObject = (level: number) => {
  return { id: level, name: data[level] };
};

export const getVerbosityLevels = () => {
  return data.map((value, index) => {
    return { id: index, name: value };
  });
};
