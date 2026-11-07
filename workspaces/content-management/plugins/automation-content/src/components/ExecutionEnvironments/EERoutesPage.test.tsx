import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import {
  mockApis,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import {
  automationContentApiRef,
  type ArtifactContents,
  type AutomationContentApi,
} from '../../api';
import { EERoutesPage } from './EERoutesPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/ee',
}));

jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: () => false,
    toggleStarredEntity: jest.fn(),
  }),
}));

jest.mock('./EECatalogPage', () => ({
  EECatalogPage: () => <div>Image catalog route</div>,
}));

const imageRef = 'zot/demo/utopia-ee@sha256:123';

function createLiveApi(): AutomationContentApi {
  const enumeration = {
    status: 'unknown' as const,
    source: 'external-introspection' as const,
  };
  return {
    listRegistries: async () => [],
    listExecutionEnvironments: async () => ({
      items: [],
      page: 1,
      totalItems: 0,
      next: null,
    }),
    getExecutionEnvironment: async () => ({
      ref: imageRef,
      registry: 'zot',
      repository: 'demo/utopia-ee',
      digest: 'sha256:123',
      tags: ['latest'],
      pullReference: 'localhost:8445/demo/utopia-ee@sha256:123',
      contentsKnown: false,
      enumeration,
      collections: [],
    }),
    getRepositoryTags: async () => ({
      registry: 'zot',
      repository: 'demo/utopia-ee',
      tags: [],
    }),
    getContents: async (): Promise<ArtifactContents> => ({
      enumeration,
      collections: [],
      items: [],
    }),
    listCollections: async () => [],
    syncRegistry: async () => ({
      status: 'completed',
      discovered: 0,
      retainedPrevious: false,
    }),
    syncArtifact: async ref => ({
      status: 'completed',
      ref,
      tag: 'latest',
      retainedPrevious: false,
    }),
  };
}

async function renderRoute(path: string): Promise<void> {
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [automationContentApiRef, createLiveApi()],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
        [permissionApiRef, mockApis.permission()],
      ]}
    >
      <Routes>
        <Route path="/content/ee/*" element={<EERoutesPage />} />
      </Routes>
    </TestApiProvider>,
    { routeEntries: [path] },
  );
}

it('renders the registry image catalog route', async () => {
  await renderRoute('/content/ee/images');

  expect(await screen.findByText('Image catalog route')).toBeTruthy();
});

it('renders the registry image details route', async () => {
  await renderRoute(`/content/ee/${encodeURIComponent(imageRef)}`);

  expect(
    await screen.findByRole('heading', { name: 'demo/utopia-ee' }),
  ).toBeTruthy();
});
