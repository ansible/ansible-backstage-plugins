import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import plugin from './alpha';

jest.mock('./hooks', () => ({
  ...jest.requireActual('./hooks'),
  useIsSuperuser: () => ({ isSuperuser: true, loading: false }),
}));
jest.mock('./components/CatalogImport', () => ({
  CatalogImport: () => <div>Native catalog import</div>,
}));
jest.mock('./components/CreateTask/formExtraFields', () => ({
  formExtraFields: [],
}));

// Separate environment avoids reusing the legacy permission hook's SWR ALLOW
// cache from the route-parity suite when testing the opposite decision.
it('does not expose native catalog import when create permission is denied', async () => {
  await renderTestApp({
    features: [plugin],
    initialRouteEntries: ['/self-service/catalog-import'],
    apis: [mockApis.permission({ authorize: AuthorizeResult.DENY })],
  });
  expect(
    await screen.findByText(
      'ERROR 404: PAGE NOT FOUND',
      {},
      { timeout: 10000 },
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText('Native catalog import')).not.toBeInTheDocument();
});
