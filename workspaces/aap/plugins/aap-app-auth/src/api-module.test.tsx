import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { useApi } from '@backstage/core-plugin-api';
import { createAapAuthApiModule } from './api-module';
import { rhAapAuthApiRef } from './api';

jest.mock('./extensions/signInPage', () => {
  throw new Error('API-only registration must not load sign-in integration');
});
jest.mock('./profile', () => {
  throw new Error('API-only registration must not load profile integration');
});

jest.mock('./settings', () => {
  throw new Error('API-only registration must not load Settings integration');
});

function TokenConsumer() {
  const auth = useApi(rhAapAuthApiRef);
  return (
    <div>{typeof auth.getAccessToken === 'function' && 'AAP API ready'}</div>
  );
}

it('supplies the OAuth API without importing either optional UI integration', async () => {
  await renderTestApp({
    features: [createAapAuthApiModule()],
    extensions: [
      PageBlueprint.make({
        name: 'api-only-consumer',
        params: {
          path: '/api-only',
          loader: async () => <TokenConsumer />,
        },
      }),
    ],
    initialRouteEntries: ['/api-only'],
  });
  expect(await screen.findByText('AAP API ready')).toBeInTheDocument();
});
