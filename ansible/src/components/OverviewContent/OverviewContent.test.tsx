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

import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import React from 'react';
import { EntityOverviewContent } from './OverviewContent';
import { configApiRef } from '@backstage/core-plugin-api';
import {
  MockStarredEntitiesApi,
  catalogApiRef,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';
import { catalogApi, configApi } from '../../tests/test_utils';

const render = (children: JSX.Element) => {
  const mockApi = new MockStarredEntitiesApi();
  mockApi.toggleStarred('test')
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [configApiRef, configApi],
        [catalogApiRef, catalogApi],
        [starredEntitiesApiRef, mockApi],
      ]}
    >
      {children}
    </TestApiProvider>
  );
};

describe('Overview Page Content', () => {
  beforeEach(() => jest.clearAllMocks());
  
  it('render Overview Page', async () => {
    const { getByTestId } = await render(<EntityOverviewContent />);
    expect(getByTestId('overview-content')).toBeInTheDocument();
    expect(getByTestId('quick-access-card')).toBeInTheDocument();
    expect(getByTestId('starred-entities')).toBeInTheDocument();
    expect(getByTestId('no-starred-list')).toBeInTheDocument();
  });
});
