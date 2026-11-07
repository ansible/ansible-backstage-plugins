import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import { usePermission } from '@backstage/plugin-permission-react';
import {
  portalContributionsApiRef,
  type CatalogContributionContext,
  type CatalogTabDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { automationContentManifest } from '../../pluginManifest';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import { EECatalogPage } from './EECatalogPage';
import styles from './EECatalogPage.module.css';

jest.mock('@backstage/plugin-permission-react', () => ({
  ...jest.requireActual('@backstage/plugin-permission-react'),
  usePermission: jest.fn(),
}));

const mockUsePermission = jest.mocked(usePermission);

beforeEach(() => {
  mockUsePermission.mockReturnValue({ allowed: false, loading: false });
});

beforeAll(() => {
  const cssApi = globalThis.CSS ?? ({} as typeof CSS);
  cssApi.escape ??= value => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: cssApi,
  });
});

jest.mock('@backstage/core-plugin-api', () => {
  const link = (params?: { ref: string }) =>
    params ? `/content/ee/${params.ref}` : '/content/ee';
  return {
    ...jest.requireActual('@backstage/core-plugin-api'),
    useRouteRef: () => link,
  };
});

jest.mock('@ansible/portal-plugin-sdk', () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
  NotificationStack: () => null,
  useNotifications: () => ({ notifications: [], removeNotification: () => {} }),
}));

jest.mock('./DefinitionFilesCatalogPage', () => ({
  DefinitionFilesCatalogPage: () => 'Mocked definition files',
}));
jest.mock('./CreateContent', () => ({ CreateContent: () => 'Mocked create' }));
jest.mock('./ImagesCatalogPage', () => ({
  ImagesCatalogPage: () => 'Fallback images',
}));
jest.mock('./catalog/ImageSyncDialog', () => ({
  ImageSyncDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Registry sync dialog</div> : null,
}));

it.each(['images', 'catalog'] as const)(
  'offers registry selection from %s to users granted sync permission',
  async view => {
    mockUsePermission.mockReturnValue({ allowed: true, loading: false });
    render(
      <TestApiProvider apis={[]}>
        <MemoryRouter initialEntries={['/content/ee/catalog']}>
          <EECatalogPage view={view} />
        </MemoryRouter>
      </TestApiProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Sync registries' }),
    );
    expect((await screen.findByRole('dialog')).textContent).toContain(
      'Registry sync dialog',
    );
    expect(mockUsePermission).toHaveBeenCalledWith({
      permission: automationContentSyncPermission,
    });
  },
);

it.each([
  ['denied', { allowed: false, loading: false }],
  ['loading', { allowed: false, loading: true }],
] as const)(
  'hides definition-file sync while permission is %s',
  async (_state, permission) => {
    mockUsePermission.mockReturnValue(permission);
    render(
      <TestApiProvider apis={[]}>
        <MemoryRouter initialEntries={['/content/ee/catalog']}>
          <EECatalogPage view="catalog" />
        </MemoryRouter>
      </TestApiProvider>,
    );
    expect(
      screen.queryByRole('button', { name: 'Sync registries' }),
    ).toBeNull();
  },
);

it('wraps the shared execution-environment page in a full-height themed surface', () => {
  const { container } = render(
    <TestApiProvider apis={[]}>
      <MemoryRouter initialEntries={['/content/ee/catalog']}>
        <EECatalogPage view="catalog" />
      </MemoryRouter>
    </TestApiProvider>,
  );

  const frame = container.querySelector('[data-testid="ee-catalog-frame"]');
  const surface = container.querySelector('[data-testid="ee-catalog-surface"]');

  expect(frame).toBeTruthy();
  expect(surface).toBeTruthy();
  expect(surface?.classList.contains('bui-Box')).toBe(true);
  expect(surface?.classList.contains(styles.pageSurface)).toBe(true);
  expect(surface?.hasAttribute('data-bg')).toBe(false);
  expect(container.querySelector('.bui-Container')).toBeNull();
  expect(
    screen.getByRole('heading', { name: 'Execution Environments' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('tab', { name: 'Execution environments' }),
  ).toBeTruthy();
  expect(screen.getByText('Mocked definition files')).toBeTruthy();
});

function renderCatalogTabs(descriptor?: CatalogTabDescriptor | null) {
  const content = (
    <MemoryRouter initialEntries={['/content/ee/images']}>
      <Routes>
        <Route
          path="/content/ee/images"
          element={<EECatalogPage view="images" />}
        />
        <Route
          path="/content/ee/catalog"
          element={<EECatalogPage view="catalog" />}
        />
        <Route
          path="/content/ee/create"
          element={<EECatalogPage view="create" />}
        />
      </Routes>
    </MemoryRouter>
  );
  render(
    descriptor !== undefined ? (
      <TestApiProvider
        apis={[
          [
            portalContributionsApiRef,
            { catalogTabs: descriptor ? [descriptor] : [] },
          ],
        ]}
      >
        {content}
      </TestApiProvider>
    ) : (
      <TestApiProvider apis={[]}>{content}</TestApiProvider>
    ),
  );
}

it('renders native Images through the SDK pipeline and retains the built-in routes', async () => {
  const loader = jest.fn(async (_context: CatalogContributionContext) => (
    <div>SDK Images panel</div>
  ));
  renderCatalogTabs({
    manifest: automationContentManifest,
    capabilityId: 'automation-content.discovery',
    entryPointId: 'automation-content.discovery.images-tab',
    attachment: 'catalog.tabs',
    loader,
  });
  expect(await screen.findByText('SDK Images panel')).toBeTruthy();
  expect(screen.queryByText('Fallback images')).toBeNull();
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
    'Execution environments',
    'Definition files',
    'Create',
  ]);
  await userEvent.click(screen.getByRole('tab', { name: 'Definition files' }));
  expect(await screen.findByText('Mocked definition files')).toBeTruthy();
  await userEvent.click(screen.getByRole('tab', { name: 'Create' }));
  expect(await screen.findByText('Mocked create')).toBeTruthy();
  await userEvent.click(
    screen.getByRole('tab', { name: 'Execution environments' }),
  );
  expect(await screen.findByText('SDK Images panel')).toBeTruthy();
  expect(loader).toHaveBeenCalledWith(
    expect.objectContaining({
      contentType: 'execution-environment-image',
      entityDetailPath: expect.any(Function),
    }),
  );
  expect(
    loader.mock.calls[0][0].entityDetailPath(
      'zot/demo/ee@sha256:123',
      'overview',
      { version: '3.0.1' },
    ),
  ).toBe(
    '/content/ee/zot%2Fdemo%2Fee%40sha256%3A123?version=3.0.1&tab=overview',
  );
});

it('does not bypass native filtering with a fallback when a provider has no matching tabs', async () => {
  renderCatalogTabs(null);
  expect(
    await screen.findByRole('tab', { name: 'Definition files' }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('tab', { name: 'Execution environments' }),
  ).toBeNull();
  expect(screen.queryByText('Fallback images')).toBeNull();
});

it('retains built-in Images and tab navigation when the native provider is absent', async () => {
  renderCatalogTabs();
  expect(await screen.findByText('Fallback images')).toBeTruthy();
  expect(
    screen
      .getByRole('tab', { name: 'Execution environments' })
      .getAttribute('aria-selected'),
  ).toBe('true');
  await userEvent.click(screen.getByRole('tab', { name: 'Definition files' }));
  expect(await screen.findByText('Mocked definition files')).toBeTruthy();
  await userEvent.click(
    screen.getByRole('tab', { name: 'Execution environments' }),
  );
  expect(await screen.findByText('Fallback images')).toBeTruthy();
});
