import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { catalogApiMock } from '@backstage/plugin-catalog-react/testUtils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
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

function mount({
  allow = true,
  catalogAvailable = true,
  permission = 'ready',
  inventory = 'ready',
}: {
  allow?: boolean;
  catalogAvailable?: boolean;
  permission?: 'ready' | 'pending' | 'unavailable';
  inventory?: 'ready' | 'pending' | 'empty' | 'error';
} = {}) {
  const queryEERepositories = jest.fn(
    async ({ page = 1, pageSize = 10 }: EERepositoryQuery) => {
      if (inventory === 'pending') return new Promise<never>(() => {});
      if (inventory === 'error') throw new Error('Inventory unavailable');
      const available = inventory === 'empty' ? [] : repositories;
      return {
        page,
        pageSize,
        totalItems: available.length,
        items: available.slice((page - 1) * pageSize, page * pageSize),
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
      [
        permissionApiRef,
        {
          async authorize() {
            if (permission === 'pending') return new Promise<never>(() => {});
            if (permission === 'unavailable')
              throw new Error('Permission unavailable');
            return {
              result: allow ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
            };
          },
        },
      ],
      mockApis.storage(),
    ],
    initialRouteEntries: ['/content/ee/images'],
  });
  return { mounted, queryEERepositories };
}

it('keeps indexed repositories visible when their catalog entries are missing', async () => {
  await mount({ catalogAvailable: false }).mounted;
  const image = await screen.findByText(
    'namespace/image-1',
    { exact: true },
    waitForPage,
  );
  expect(screen.getByRole('main').contains(image)).toBe(true);
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
    await within(await screen.findByRole('main')).findByText(
      'You do not have permission to view execution environment images.',
    ),
  ).toBeTruthy();
  expect(queryEERepositories).not.toHaveBeenCalled();
});

it.each([
  ['pending', /Checking image access/],
  ['unavailable', /Image access could not be checked/],
] as const)(
  'keeps the %s permission message in the main landmark',
  async (permission, message) => {
    const { mounted, queryEERepositories } = mount({ permission });
    await mounted;
    const main = await screen.findByRole('main', {}, waitForPage);
    expect(await within(main).findByText(message)).toBeTruthy();
    expect(queryEERepositories).not.toHaveBeenCalled();
  },
);

it.each([
  ['pending', /Search images/],
  ['empty', /No image repositories match these filters/],
  ['error', /Image repositories could not be loaded/],
] as const)(
  'keeps the %s inventory in the main landmark',
  async (inventory, message) => {
    const { mounted } = mount({ inventory });
    await mounted;
    const content =
      inventory === 'pending'
        ? await screen.findByRole('searchbox', { name: message }, waitForPage)
        : await screen.findByText(message, {}, waitForPage);
    expect(screen.getByRole('main').contains(content)).toBe(true);
  },
);

// React Aria escapes item IDs when moving focus. JSDOM does not expose CSS.escape.
const cssDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
beforeAll(() => {
  if (!globalThis.CSS?.escape) {
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: { escape: (value: string) => value.replace(/[^\w-]/g, '\\$&') },
    });
  }
});
afterAll(() => {
  if (cssDescriptor) Object.defineProperty(globalThis, 'CSS', cssDescriptor);
  else Reflect.deleteProperty(globalThis, 'CSS');
});

it('forwards status and source filters and returns to the first page', async () => {
  const user = userEvent.setup();
  const { mounted, queryEERepositories } = mount();
  await mounted;
  await screen.findByText('namespace/image-1', { exact: true }, waitForPage);
  await user.click(screen.getByRole('button', { name: /next table page/i }));
  await screen.findByText('namespace/image-11', { exact: true }, waitForPage);

  await user.click(screen.getByRole('button', { name: 'Change image view' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Grid view' }));
  expect(
    await screen.findByText('namespace/image-11', { exact: true }),
  ).toBeTruthy();
  expect(queryEERepositories).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 2 }),
  );

  await user.click(screen.getByRole('button', { name: /source type/i }));
  await user.click(
    await screen.findByRole('option', { name: 'External registry' }),
  );
  await waitFor(() =>
    expect(queryEERepositories).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, sourceType: 'external-registry' }),
    ),
  );
  await user.click(screen.getByRole('button', { name: /status/i }));
  await user.click(await screen.findByRole('option', { name: 'Stale' }));
  await waitFor(() =>
    expect(queryEERepositories).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        sourceType: 'external-registry',
        status: 'stale',
      }),
    ),
  );
});
