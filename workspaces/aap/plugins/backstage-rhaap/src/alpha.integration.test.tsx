/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { fireEvent, screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import {
  catalogApiRef,
  MockStarredEntitiesApi,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';
import { searchApiRef } from '@backstage/plugin-search-react';
import plugin from './alpha';

it('renders the existing overview with native APIs and follows its learning link', async () => {
  const getEntities = jest.fn().mockResolvedValue({ items: [] });
  await renderTestApp({
    features: [plugin],
    initialRouteEntries: ['/ansible'],
    apis: [
      [catalogApiRef, { getEntities }],
      [starredEntitiesApiRef, new MockStarredEntitiesApi()],
      [searchApiRef, { query: async () => ({ results: [] }) }],
    ],
  });

  expect(
    await screen.findByTestId('overview-content', {}, { timeout: 10000 }),
  ).toBeInTheDocument();
  expect(await screen.findByTestId('no-starred-list')).toBeInTheDocument();
  expect(getEntities).toHaveBeenCalledWith({
    filter: [{ 'metadata.tags': 'ansible' }],
  });

  fireEvent.click(screen.getByText('Start Learning Path'));
  expect(await screen.findByTestId('learn-content')).toBeInTheDocument();
}, 20000);
