import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AutomationContentRoutes } from './AutomationContentRoutes';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApp: () => ({}),
}));

jest.mock('./ContentLandingPage', () => ({
  ContentLandingPage: () => <div>Content landing</div>,
}));
jest.mock('./ExecutionEnvironments/ImagesCatalogPage', () => ({
  ImagesCatalogPage: () => <div>Image catalog</div>,
}));
jest.mock('./ExecutionEnvironments/EEDetailsPage', () => ({
  EEDetailsPage: () => <div>Image details</div>,
}));
jest.mock('./CollectionsCatalog/CollectionsCatalogPage', () => ({
  CollectionsCatalogPage: () => <div>Collection catalog</div>,
}));
jest.mock('./CollectionsCatalog/CollectionDetailsPage', () => ({
  CollectionDetailsPage: () => <div>Collection details</div>,
}));

it.each([
  ['', 'Content landing'],
  ['/execution-environments', 'Image catalog'],
  ['/execution-environments/example', 'Image details'],
  ['/collections', 'Collection catalog'],
  ['/collections/example/demo', 'Collection details'],
])('mounts %s in the legacy content route', async (path, title) => {
  render(
    <TestApiProvider apis={[[permissionApiRef, mockApis.permission()]]}>
      <MemoryRouter initialEntries={[`/automation-content${path}`]}>
        <Routes>
          <Route
            path="/automation-content/*"
            element={<AutomationContentRoutes />}
          />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(await screen.findByText(title)).toBeTruthy();
});
