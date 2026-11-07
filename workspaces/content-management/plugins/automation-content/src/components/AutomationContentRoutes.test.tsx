import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { AutomationContentRoutes } from './AutomationContentRoutes';
import { EERoutesPage } from './ExecutionEnvironments/EERoutesPage';
import {
  renderInTestApp,
  TestApiProvider,
  mockApis,
} from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/content/ee',
}));

jest.mock('./ExecutionEnvironments/ImagesCatalogPage', () => ({
  ImagesCatalogPage: () => <div>Image catalog</div>,
}));
jest.mock('./ExecutionEnvironments/EECatalogPage', () => ({
  EECatalogPage: ({ view }: { view: 'images' | 'catalog' | 'create' }) => {
    if (view === 'images') return <div>Image catalog</div>;
    if (view === 'catalog') return <div>Definition files catalog</div>;
    return <div>Create templates</div>;
  },
}));
jest.mock('./ExecutionEnvironments/EEDetailsPage', () => ({
  EEDetailsPage: () => <div>Image details</div>,
}));

it.each([
  ['', 'Image catalog'],
  ['/execution-environments', 'Image catalog'],
  ['/execution-environments/catalog', 'Definition files catalog'],
  ['/execution-environments/create', 'Create templates'],
  ['/execution-environments/example', 'Image details'],
])('mounts %s in the legacy content route', async (path, title) => {
  await renderInTestApp(
    <TestApiProvider apis={[[permissionApiRef, mockApis.permission()]]}>
      <Routes>
        <Route path="/content/ee/*" element={<EERoutesPage />} />
        <Route
          path="/automation-content/*"
          element={<AutomationContentRoutes />}
        />
      </Routes>
    </TestApiProvider>,
    { routeEntries: [`/automation-content${path}`] },
  );
  expect(await screen.findByText(title)).toBeTruthy();
});
