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

import {
  getVerbosityObject,
  getVerbosityLevels,
  TERMINAL_JOB_STATUSES,
  compareVersions,
} from './constants';

describe('verbosity helpers', () => {
  it('getVerbosityObject returns correct object for valid level', () => {
    expect(getVerbosityObject(0)).toEqual({ id: 0, name: '0 (Normal)' });
    expect(getVerbosityObject(3)).toEqual({ id: 3, name: '3 (Debug)' });
    expect(getVerbosityObject(5)).toEqual({ id: 5, name: '5 (WinRM Debug)' });
  });

  it('getVerbosityObject returns undefined name for out-of-range level', () => {
    expect(getVerbosityObject(-1)).toEqual({ id: -1, name: undefined });
    expect(getVerbosityObject(10)).toEqual({ id: 10, name: undefined });
  });

  it('getVerbosityLevels returns full mapped list', () => {
    const levels = getVerbosityLevels();
    expect(levels).toHaveLength(6);
    expect(levels[0]).toEqual({ id: 0, name: '0 (Normal)' });
    expect(levels[5]).toEqual({ id: 5, name: '5 (WinRM Debug)' });

    levels.forEach((level, idx) => {
      expect(level.id).toBe(idx);
      expect(typeof level.name).toBe('string');
    });
  });
});

describe('TERMINAL_JOB_STATUSES', () => {
  it('contains expected terminal statuses', () => {
    expect(TERMINAL_JOB_STATUSES).toEqual(
      new Set(['successful', 'failed', 'error', 'canceled']),
    );
  });

  it('does not match non-terminal statuses', () => {
    expect(TERMINAL_JOB_STATUSES.has('running')).toBe(false);
    expect(TERMINAL_JOB_STATUSES.has('pending')).toBe(false);
    expect(TERMINAL_JOB_STATUSES.has('waiting')).toBe(false);
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
  });

  it('returns 1 when first is greater', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
  });

  it('returns -1 when first is smaller', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('handles versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });
});
