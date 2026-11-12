import { screen } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { catalogApiMock } from '@backstage/plugin-catalog-react/testUtils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { EERepositoryQuery } from '@ansible/automation-content-common/eeRepository';
import automationContentPlugin from '../../alpha';
import { automationContentApiRef } from '../../api';

const repositories = Array.from({ length: 21 }, (_, i) => {
  const name = `ee-repo-${i.toString(16).padStart(48, '0')}`;
  return {
    registry: 'local',
    repository: `namespace/image-${i + 1}`,
    entityRef: `component:default/${name}`,
    name,
    representativeDigest: 'sha256:digest',
    representativeRef: 'local/namespace/image@sha256:digest',
    tagCount: 1,
  };
});
const waitForPage = { timeout: 10000 };
jest.setTimeout(20000);

function mount({ allow = true, catalogAvailable = true } = {}) {
  const queryEERepositories = jest.fn(
    async ({ page = 1, pageSize = 10 }: EERepositoryQuery) => {
      return {
        page,
        pageSize,
        totalItems: repositories.length,
        items: repositories.slice((page - 1) * pageSize, page * pageSize),
      };
    },
  );
  const mounted = renderTestApp({
    features: [catalogPlugin, automationContentPlugin],
    apis: [
      [
        automationContentApiRef,
        {
          queryEERepositories,
          getRegistryStatus: async () => ({
            items: [{ name: 'local', url: 'http://example.test' }],
            manualSyncEnabled: false,
          }),
        },
      ],
      catalogApiMock({
        entities: catalogAvailable
          ? repositories.map(row => ({
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'Component',
              metadata: {
                name: row.name,
                annotations: { 'ansible.com/ee-repository': 'true' },
              },
              spec: { type: 'execution-environment-repository' },
            }))
          : [],
      }),
      mockApis.permission({
        authorize: allow ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
      }),
      mockApis.storage(),
    ],
    initialRouteEntries: ['/content/ee/images'],
  });
  return { mounted, queryEERepositories };
}

it('keeps indexed repositories visible when their catalog entries are missing', async () => {
  await mount({ catalogAvailable: false }).mounted;
  expect(
    await screen.findByText('namespace/image-1', { exact: true }, waitForPage),
  ).toBeTruthy();
  expect(
    (await screen.findAllByText(/Details are unavailable/)).length,
  ).toBeGreaterThan(0);
  expect(screen.queryByRole('link', { name: 'namespace/image-1' })).toBeNull();
  expect(
    screen.queryByRole('button', { name: /Add.*to favorites/ }),
  ).toBeNull();
});

it('does not request the inventory when EE view is denied', async () => {
  const { mounted, queryEERepositories } = mount({ allow: false });
  await mounted;
  expect(
    await screen.findByText(
      'You do not have permission to view execution environment images.',
    ),
  ).toBeTruthy();
  expect(queryEERepositories).not.toHaveBeenCalled();
});
