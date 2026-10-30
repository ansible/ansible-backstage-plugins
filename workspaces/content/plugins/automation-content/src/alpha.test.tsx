import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import plugin from './alpha';

jest.mock('@ansible/portal-plugin-sdk', () => ({
  ...jest.requireActual('@ansible/portal-plugin-sdk'),
  useSyncStatusPolling: () => ({
    isSyncInProgress: false,
    syncProgress: [],
    startTracking: jest.fn(),
  }),
  useIsSuperuser: () => ({ isSuperuser: false }),
}));

// Route discovery is independent of registry/catalog networking, covered by page tests.
jest.mock('./components/ExecutionEnvironments/ImagesCatalogPage', () => ({
  ImagesCatalogPage: () => <h1>Execution environments</h1>,
}));
jest.mock('./components/ExecutionEnvironments/EECatalogPage', () => ({
  EECatalogPage: () => <h1>Execution Environments</h1>,
}));
jest.mock('./components/ContentLandingPage', () => ({
  ContentLandingPage: () => <h1>Automation content</h1>,
}));
jest.mock('./components/CollectionsCatalog/CollectionsCatalogPage', () => ({
  CollectionsCatalogPage: () => <h1>Collections</h1>,
}));
jest.mock('./components/CollectionsCatalog/CollectionDetailsPage', () => ({
  CollectionDetailsPage: () => <h1>Collection details</h1>,
}));

it.each([
  ['/automation-content', 'Automation content'],
  ['/automation-content/execution-environments', 'Execution Environments'],
  ['/automation-content/collections', 'Collections'],
  ['/automation-content/collections/ns/name_with.dots', 'Collection details'],
])('discovers the native page at %s', async (path, text) => {
  await renderTestApp({ features: [plugin], initialRouteEntries: [path] });
  expect(await screen.findByText(text, {}, { timeout: 10000 })).toBeTruthy();
});
