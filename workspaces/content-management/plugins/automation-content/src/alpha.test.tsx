import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import plugin from './alpha';
import { useLocation, useNavigationType, useParams } from 'react-router-dom';
import { Suspense, useMemo } from 'react';
import { compatWrapper } from '@backstage/core-compat-api';
import { useApi } from '@backstage/core-plugin-api';
import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import { portalContributionsApiRef } from '@ansible/portal-extension-api/alpha';
import {
  createPortalContributionProvider,
  useNativeCatalogTabs,
} from '@ansible/portal-extension-host/alpha';
import { automationContentManifest } from './pluginManifest';

function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return (
    <div data-testid="destination" data-navigation={useNavigationType()}>
      {pathname + search + hash}
    </div>
  );
}

// Isolate the legacy mount from destination-page internal index redirects.
jest.mock('./components/ExecutionEnvironments/EERoutesPage', () => ({
  EERoutesPage: () => {
    const { pathname } = useLocation();
    const ref = pathname.slice('/content/ee/'.length);
    return (
      <>
        <h1>
          {pathname === '/content/ee'
            ? 'Execution Environments'
            : `EE details ${decodeURIComponent(ref)}`}
        </h1>
        <LocationProbe />
      </>
    );
  },
}));

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
  ImagesCatalogPage: () => <h1>Images</h1>,
}));
jest.mock('./components/ExecutionEnvironments/EECatalogPage', () => ({
  EECatalogPage: () => (
    <>
      <h1>Execution Environments</h1>
      <LocationProbe />
    </>
  ),
  ImagesTabContent: () => <h2>Native images content</h2>,
}));
jest.mock('./components/ExecutionEnvironments/EEDetailsPage', () => ({
  EEDetailsPage: () => {
    const { ref } = useParams();
    return (
      <>
        <h1>EE details {ref}</h1>
        <LocationProbe />
      </>
    );
  },
}));

it.each([
  ['/content', 'Execution Environments'],
  ['/content/ee', 'Execution Environments'],
  ['/automation-content', 'Execution Environments'],
  ['/automation-content/execution-environments', 'Execution Environments'],
  [
    '/automation-content/execution-environments/registry%2Fdemo%40sha256%3A123',
    'EE details registry/demo@sha256:123',
  ],
])(
  'discovers the native page at %s',
  async (path, text) => {
    await renderTestApp({ features: [plugin], initialRouteEntries: [path] });
    expect(await screen.findByText(text, {}, { timeout: 10000 })).toBeTruthy();
  },
  15000,
);

it.each([
  ['/content', '/content/ee'],
  ['/automation-content', '/content/ee'],
  ['/automation-content/execution-environments', '/content/ee'],
  [
    '/automation-content/execution-environments/registry%2Fdemo%40sha256%3A123',
    '/content/ee/registry%2Fdemo%40sha256%3A123',
  ],
])('preserves query/hash with replace at %s', async (path, destination) => {
  await renderTestApp({
    features: [plugin],
    initialRouteEntries: [`${path}?tag=latest%20tag#details`],
  });
  const target = await screen.findByTestId('destination');
  expect(target.textContent).toBe(`${destination}?tag=latest%20tag#details`);
  expect(target.getAttribute('data-navigation')).toBe('REPLACE');
});

function NativeCatalogProbe({ contentType }: { contentType: string }) {
  const provider = useApi(portalContributionsApiRef);
  const context = useMemo(
    () => ({ contentType, entityDetailPath: (name: string) => `/ee/${name}` }),
    [contentType],
  );
  const tabs = useNativeCatalogTabs(context);
  return (
    <>
      <div>Collected tabs: {provider.catalogTabs?.length ?? 0}</div>
      <Suspense fallback={<div>Loading images</div>}>
        {tabs?.map(tab => (
          <div key={tab.id}>
            <span>{tab.label}</span>
            <tab.component />
          </div>
        ))}
      </Suspense>
    </>
  );
}

it('declares the Images catalog entry without an entity applicability predicate', () => {
  expect(automationContentManifest).toMatchObject({
    id: 'automation-content',
    apiVersion: '0.1.0',
    capabilities: [
      {
        id: 'automation-content.discovery',
        ownerPlugin: 'automation-content',
        minimumHostApiVersion: '0.1.0',
        appliesToContentTypes: [CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE],
        entryPoints: [
          {
            id: 'automation-content.discovery.images-tab',
            kind: 'page-tab',
            surface: 'experience-slot',
            label: 'Images',
            order: 0,
            appliesToContentTypes: [CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE],
            launches: { type: 'slot', targetSlot: 'catalog.tabs' },
          },
        ],
      },
    ],
  });
  expect(automationContentManifest.capabilities[0].appliesTo).toBeUndefined();
});

it('collects the blueprint through real host manifest validation and loads only Images content', async () => {
  await renderTestApp({
    features: [
      plugin,
      createFrontendPlugin({
        pluginId: 'portal',
        extensions: [
          createPortalContributionProvider(),
          PageBlueprint.make({
            name: 'images-probe',
            params: {
              path: '/images-probe',
              loader: async () =>
                compatWrapper(
                  <NativeCatalogProbe
                    contentType={CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE}
                  />,
                ),
            },
          }),
        ],
      }),
    ],
    initialRouteEntries: ['/images-probe'],
  });
  expect(await screen.findByText('Collected tabs: 1')).toBeTruthy();
  expect(await screen.findByText('Images')).toBeTruthy();
  expect(await screen.findByText('Native images content')).toBeTruthy();
  expect(
    screen.queryByRole('heading', { name: 'Execution Environments' }),
  ).toBeNull();
});
