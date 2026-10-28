import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import plugin from './alpha';

// Route discovery is independent of registry/catalog networking, covered by page tests.
jest.mock('./components/ExecutionEnvironments/ImagesCatalogPage', () => ({
  ImagesCatalogPage: () => <h1>Execution environments</h1>,
}));

it.each([
  ['/automation-content', 'Automation content is coming in the next commit.'],
  ['/automation-content/execution-environments', 'Execution environments'],
  [
    '/automation-content/collections',
    'Collections are coming in the next commit.',
  ],
  [
    '/automation-content/collections/default/example',
    'Collections are coming in the next commit.',
  ],
])('discovers the native page at %s', async (path, text) => {
  await renderTestApp({ features: [plugin], initialRouteEntries: [path] });
  expect(await screen.findByText(text, {}, { timeout: 10000 })).toBeTruthy();
});
