import { screen } from '@testing-library/react';
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { renderTestApp } from '@backstage/frontend-test-utils';
import aapAppAuth from './alpha';

// A missing optional Settings library must not prevent native feature resolution.
jest.mock('@backstage/plugin-user-settings', () => {
  throw new Error('The host does not provide the optional Settings library');
});

it('resolves the combined auth module without loading the optional Settings library', async () => {
  await renderTestApp({
    features: [aapAppAuth],
    config: {
      app: { baseUrl: 'http://localhost:3000' },
      backend: { baseUrl: 'http://localhost:7007' },
    },
    extensions: [
      PageBlueprint.make({
        name: 'host',
        params: {
          path: '/host',
          loader: async () => <div>Host without Settings</div>,
        },
      }),
    ],
    initialRouteEntries: ['/host'],
  });
  expect(await screen.findByText('Host without Settings')).toBeInTheDocument();
});
