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

import { screen, fireEvent, waitFor } from '@testing-library/react';
import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { EntityOverviewContent } from './OverviewContent';
import { configApiRef } from '@backstage/core-plugin-api';
import {
  MockStarredEntitiesApi,
  catalogApiRef,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';
import {
  mockCatalogApi,
  mockConfigApi,
  mockEntities,
} from '../../tests/test_utils';

const mockNavigate = jest.fn();
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: () => mockNavigate,
}));

const renderOverview = (starredRefs: string[] = []) => {
  const mockApi = new MockStarredEntitiesApi();
  for (const ref of starredRefs) {
    mockApi.toggleStarred(ref);
  }
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [configApiRef, mockConfigApi],
        [catalogApiRef, mockCatalogApi],
        [starredEntitiesApiRef, mockApi],
      ]}
    >
      <EntityOverviewContent />
    </TestApiProvider>,
  );
};

describe('Overview Page Content', () => {
  beforeEach(() => jest.clearAllMocks());

  it('render Overview Page', async () => {
    const { getByTestId } = await renderOverview(['test']);
    expect(getByTestId('overview-content')).toBeInTheDocument();
    expect(getByTestId('quick-access-card')).toBeInTheDocument();
    expect(getByTestId('starred-entities')).toBeInTheDocument();
    expect(getByTestId('no-starred-list')).toBeInTheDocument();
  });
});

describe('QuickAccessCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('navigates when clicking internal action button', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });
    await renderOverview();

    const button = screen.getByText('Start Learning Path');
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledWith('../learn');
  });
});

describe('Favourites', () => {
  beforeEach(() => jest.clearAllMocks());

  it('displays error when catalog API fails', async () => {
    mockCatalogApi.getEntities.mockRejectedValue(
      new Error('Failed to load entities'),
    );
    await renderOverview();

    await waitFor(() => {
      expect(
        screen.getByText('Error: Failed to load entities'),
      ).toBeInTheDocument();
    });
  });

  it('displays starred entities when entities are starred', async () => {
    mockCatalogApi.getEntities.mockResolvedValue({ items: mockEntities });
    await renderOverview(['template:default/playbook-template']);

    await waitFor(() => {
      expect(screen.getByTestId('starred-list')).toBeInTheDocument();
    });

    expect(screen.getByText('playbook-template')).toBeInTheDocument();
  });
});
