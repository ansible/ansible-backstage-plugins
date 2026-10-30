import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { scmAuthApiRef } from '@backstage/integration-react';
import { NotificationProvider } from '@ansible/portal-plugin-sdk';
import type { Entity } from '@backstage/catalog-model';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { MemoryRouter } from 'react-router-dom';
import { DefinitionFilesCatalogPage } from './DefinitionFilesCatalogPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef:
    () => (params?: { namespace?: string; kind?: string; name?: string }) =>
      params
        ? `/catalog/${params.namespace}/${params.kind}/${params.name}`
        : '/automation-content/execution-environments',
}));
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

const definition: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'web-ee',
    namespace: 'default',
    uid: 'definition-uid',
    title: 'Web execution environment',
    description: 'A definition for web automation.',
    tags: ['linux', 'web'],
  },
  spec: { type: 'execution-environment', owner: 'group:default/platform' },
};

function renderPage(getEntities = async () => ({ items: [definition] })) {
  return render(
    <TestApiProvider
      apis={[
        [
          catalogApiRef,
          {
            getEntities,
            queryEntities: async () => {
              const response = await getEntities();
              return {
                ...response,
                totalItems: response.items.length,
                pageInfo: {},
              };
            },
            getEntityFacets: async () => ({ facets: {} }),
            getEntitiesByRefs: async () => ({
              items: [
                {
                  apiVersion: 'backstage.io/v1alpha1',
                  kind: 'Group',
                  metadata: { name: 'platform' },
                },
              ],
            }),
            removeEntityByUid: jest.fn(),
          },
        ],
        [scmAuthApiRef, { getCredentials: jest.fn() }],
        [configApiRef, mockApis.config()],
        [discoveryApiRef, mockApis.discovery()],
        [fetchApiRef, { fetch: jest.fn() }],
        [identityApiRef, mockApis.identity()],
      ]}
    >
      <MemoryRouter>
        <NotificationProvider>
          <DefinitionFilesCatalogPage />
        </NotificationProvider>
      </MemoryRouter>
    </TestApiProvider>,
  );
}

it('renders entity-backed definition columns and metadata', async () => {
  renderPage();
  expect(
    await screen.findByRole('heading', {
      name: 'Execution Environments definition files (1)',
    }),
  ).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeTruthy();
  expect(
    screen.getByRole('columnheader', { name: 'Description' }),
  ).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'web-ee' }).getAttribute('href'),
  ).toBe('/catalog/default/component/web-ee');
  expect(await screen.findByText('platform')).toBeTruthy();
});

it('gates row actions by annotations and buildability', async () => {
  renderPage();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for web-ee' }),
  );
  expect(screen.queryByRole('menuitem', { name: 'Build' })).toBeNull();
  expect(
    screen.getByRole('menuitem', { name: 'Edit definition' }),
  ).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'View in source' })).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
});

it('shows the prototype first-run call to action for an empty catalog', async () => {
  renderPage(async () => ({ items: [] }));
  expect(
    await screen.findByRole('heading', {
      name: 'No Execution Environment definition files, yet',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: 'Create Execution Environment definition file',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', {
      name: 'How to build and use Execution Environment from definition files',
    }),
  ).toBeTruthy();
});
