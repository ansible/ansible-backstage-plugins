import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import type { Entity } from '@backstage/catalog-model';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CreateContent } from './CreateContent';
import { errorApiRef, identityApiRef } from '@backstage/core-plugin-api';

jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    starredEntities: new Set<string>(),
    isStarredEntity: () => false,
    toggleStarredEntity: jest.fn(),
  }),
}));

beforeAll(() => {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { escape: (value: string) => value },
  });
});

function CurrentPath(): React.ReactElement {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

const templates: Entity[] = [
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'minimal-ee',
      namespace: 'default',
      uid: 'minimal-ee',
      title: 'Minimal execution environment',
      description: 'Start with a minimal definition.',
      tags: ['minimal', 'linux'],
    },
    spec: { type: 'execution-environment' },
  },
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: { name: 'service-template', uid: 'service-template' },
    spec: { type: 'service' },
  },
];

function renderCreate(permissionApi = mockApis.permission()) {
  return render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: templates }) }],
        [permissionApiRef, permissionApi],
        [errorApiRef, { post: jest.fn(), error$: jest.fn() }],
        [identityApiRef, mockApis.identity()],
      ]}
    >
      <MemoryRouter>
        <CurrentPath />
        <CreateContent />
      </MemoryRouter>
    </TestApiProvider>,
  );
}

it('shows only EE templates and filters them by search and tags', async () => {
  renderCreate();

  expect(
    await screen.findByRole('link', {
      name: 'Minimal execution environment',
    }),
  ).toBeTruthy();
  expect(screen.queryByText('service-template')).toBeNull();
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Search' }),
    'not found',
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('link', { name: 'Minimal execution environment' }),
    ).toBeNull(),
  );
});

it('shows the permission-gated import action and routes to catalog import', async () => {
  renderCreate();
  await userEvent.click(
    await screen.findByRole('button', { name: 'more options' }),
  );
  expect(
    screen.getByRole('menuitem', { name: 'Import Template' }),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole('menuitem', { name: 'Import Template' }),
  );
  expect(screen.getByTestId('current-path').textContent).toBe(
    '/catalog-import',
  );
});
