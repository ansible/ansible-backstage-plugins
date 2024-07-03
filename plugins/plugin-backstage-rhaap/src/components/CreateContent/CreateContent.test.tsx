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
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useEntityList: jest.fn(),
}));

import React from 'react';
import { EntityCreateContent } from './CreateContent';
import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { configApiRef, errorApiRef } from '@backstage/core-plugin-api';
import { catalogApi, configApi, mockEntities } from '../../tests/test_utils';
import {
  MockStarredEntitiesApi,
  catalogApiRef,
  starredEntitiesApiRef,
  useEntityList,
} from '@backstage/plugin-catalog-react';

const errorApi = {
  post: jest.fn(),
};

const render = (children: JSX.Element) => {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [configApiRef, configApi],
        [catalogApiRef, catalogApi],
        [starredEntitiesApiRef, new MockStarredEntitiesApi()],
        [errorApiRef, errorApi],
      ]}
    >
      {children}
    </TestApiProvider>,
  );
};

describe('Create Content', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should render page', async () => {
    (useEntityList as jest.Mock).mockReturnValue({
      loading: false,
      entities: mockEntities,
      filters: { tags: undefined },
      updateFilters: jest.fn()
    });
    const { getByTestId } = await render(<EntityCreateContent />);
    expect(getByTestId('create-content')).toBeDefined();
  });

  it('should return progress if the hook is loading', async () => {
    (useEntityList as jest.Mock).mockReturnValue({
      loading: true,
      filters: { tags: [] },
    });

    const { getByTestId } = await render(<EntityCreateContent />);

    expect(getByTestId('progress')).toBeInTheDocument();
  });

  it('should use the error api if there is an error with the retrieval of entitylist', async () => {
    const mockError = new Error('things went poop');
    (useEntityList as jest.Mock).mockReturnValue({
      error: mockError,
      filters: { tags: [] },
    });

    const { findByTestId } = await render(<EntityCreateContent />);

    expect(await findByTestId('error-message')).toBeInTheDocument();
  });

  it('should return a no templates message if entities is unset', async () => {
    (useEntityList as jest.Mock).mockReturnValue({
      entities: null,
      loading: false,
      error: null,
      filters: { tags: ['ansible'] },
    });

    const { findByText } = await render(<EntityCreateContent />);

    expect(await findByText(/No templates found/)).toBeInTheDocument();
  });

  it('should return a no templates message if entities has no values in it', async () => {
    (useEntityList as jest.Mock).mockReturnValue({
      entities: [],
      loading: false,
      error: null,
      filters: { tags: ['ansible'] },
    });

    const { findByText } = await render(<EntityCreateContent />);

    expect(await findByText(/No templates found/)).toBeInTheDocument();
  });
});
