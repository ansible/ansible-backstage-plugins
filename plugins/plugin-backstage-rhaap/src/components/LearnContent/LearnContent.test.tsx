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

import React from 'react';
import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import {
  MockSearchApi,
  searchApiRef,
} from '@backstage/plugin-search-react';
import { EntityLearnContent } from './LearnContent';

const setTermMock = jest.fn();
const setFiltersMock = jest.fn();

jest.mock('@backstage/plugin-search-react', () => ({
  ...jest.requireActual('@backstage/plugin-search-react'),
  useSearch: jest.fn().mockReturnValue({
    term: '',
    setTerm: (term: any) => setTermMock(term),
    filters: {types: ['Learning Paths', 'Labs']},
    setFilters: (filters: any) => setFiltersMock(filters),
  })
  .mockReturnValueOnce({
    term: '',
    setTerm: (term: any) => setTermMock(term),
    filters: {types: ['Learning Paths', 'Labs']},
    setFilters: (filters: any) => setFiltersMock(filters),
  })
  .mockReturnValueOnce({
    term: 'yaml',
    setTerm: (term: any) => setTermMock(term),
    filters: {types: ['Learning Paths', 'Labs']},
    setFilters: (filters: any) => setFiltersMock(filters),
  }),
}));

const render = (children: JSX.Element) => {
  return (
    <TestApiProvider apis={[[searchApiRef, new MockSearchApi()]]}>
      {children}
    </TestApiProvider>
  );
};

describe('Learn Tab Content', () => {
  it('render Learn Tab', async () => {
    const { getByTestId } = await renderInTestApp(
      render(<EntityLearnContent />),
    );
    expect(getByTestId('learn-content')).toBeInTheDocument();
  });

  it('with search term', async () => {
    const { getByTestId } = await renderInTestApp(
      render(<EntityLearnContent />),
    );

    expect(getByTestId('learning-paths')).toBeInTheDocument();
  });
});
