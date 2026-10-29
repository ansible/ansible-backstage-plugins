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
  SCM_INTEGRATION_AUTH_FAILED_CODE,
  compareVersions,
  TERMINAL_JOB_STATUSES,
  getVerbosityObject,
  getVerbosityLevels,
} from './constants';

describe('backstage-rhaap-common constants shim', () => {
  it('re-exports AAP constants from aap-common', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(TERMINAL_JOB_STATUSES.has('successful')).toBe(true);
    expect(getVerbosityObject(0)).toEqual({ id: 0, name: '0 (Normal)' });
    expect(getVerbosityLevels()).toHaveLength(6);
  });

  it('keeps SCM_INTEGRATION_AUTH_FAILED_CODE locally', () => {
    expect(SCM_INTEGRATION_AUTH_FAILED_CODE).toBe('INTEGRATION_AUTH_FAILED');
  });
});
