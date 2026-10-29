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
  executionEnvironmentsViewPermission,
  gitRepositoriesViewPermission,
  collectionsViewPermission,
  templatesViewPermission,
  historyViewPermission,
  ansiblePermissions,
} from './permissions';

describe('permissions', () => {
  it('exports executionEnvironmentsViewPermission with correct shape', () => {
    expect(executionEnvironmentsViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.execution-environments.view',
      attributes: {},
    });
  });

  it('exports gitRepositoriesViewPermission with correct shape', () => {
    expect(gitRepositoriesViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.git-repositories.view',
      attributes: {},
    });
  });

  it('exports collectionsViewPermission with correct shape', () => {
    expect(collectionsViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.collections.view',
      attributes: {},
    });
  });

  it('exports templatesViewPermission with correct shape', () => {
    expect(templatesViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.templates.view',
      attributes: {},
    });
  });

  it('exports historyViewPermission with correct shape', () => {
    expect(historyViewPermission).toEqual({
      type: 'basic',
      name: 'ansible.history.view',
      attributes: {},
    });
  });

  it('ansiblePermissions contains all five permissions', () => {
    expect(ansiblePermissions).toHaveLength(5);
    expect(ansiblePermissions).toContain(executionEnvironmentsViewPermission);
    expect(ansiblePermissions).toContain(gitRepositoriesViewPermission);
    expect(ansiblePermissions).toContain(collectionsViewPermission);
    expect(ansiblePermissions).toContain(templatesViewPermission);
    expect(ansiblePermissions).toContain(historyViewPermission);
  });

  it('each permission has type basic and attributes object', () => {
    ansiblePermissions.forEach(permission => {
      expect(permission.type).toBe('basic');
      expect(permission.attributes).toEqual({});
      expect(typeof permission.name).toBe('string');
      expect(permission.name.length).toBeGreaterThan(0);
    });
  });
});
