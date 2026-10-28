import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AutomationContentRoutes } from './AutomationContentRoutes';

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
])('mounts %s in the legacy content route', (path, title) => {
  render(
    <MemoryRouter initialEntries={[`/automation-content${path}`]}>
      <Routes>
        <Route
          path="/automation-content/*"
          element={<AutomationContentRoutes />}
        />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText(title)).toBeTruthy();
});
