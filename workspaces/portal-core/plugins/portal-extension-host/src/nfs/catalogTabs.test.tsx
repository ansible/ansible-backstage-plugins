import { useMemo } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { compatWrapper } from '@backstage/core-compat-api';
import {
  PageBlueprint,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import {
  CatalogTabBlueprint,
  type CatalogTabDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { collectCatalogTabs } from './catalogTabs';
import { createPortalContributionProvider } from './createPortalContributionProvider';
import { useNativeCatalogTabs } from './useNativeCatalogTabs';
import { ExtensionTabContent } from '../ExtensionRenderer';

const permission = createPermission({
  name: 'scanner.settings.view',
  resourceType: 'capability',
  attributes: { action: 'read' },
});
const descriptor: CatalogTabDescriptor = {
  manifest: {
    id: 'scanner',
    version: '1.0.0',
    apiVersion: '0.1.0',
    entitlements: [],
    capabilities: [
      {
        id: 'scanner.settings',
        ownerPlugin: 'scanner',
        experienceId: 'content-quality-assessment',
        displayName: 'Settings',
        description: 'Settings',
        minimumHostApiVersion: '0.1.0',
        appliesToContentTypes: ['playbook-repository'],
        entryPoints: [
          {
            id: 'scanner.settings.tab',
            kind: 'page-tab',
            surface: 'experience-slot',
            label: 'Settings',
            appliesToContentTypes: ['playbook-repository'],
            requiredPermission: { permission, resourceRef: 'scanner' },
            launches: { type: 'slot', targetSlot: 'catalog.tabs' },
          },
        ],
      },
    ],
  },
  capabilityId: 'scanner.settings',
  entryPointId: 'scanner.settings.tab',
  attachment: 'catalog.tabs',
  enabledByConfig: 'scanner.enabled',
  loader: jest.fn(async context => (
    <div>
      Settings at{' '}
      {context.entityDetailPath('repo', 'scanner.details', { rule: 'R001' })}
    </div>
  )),
};

function Catalog({ contentType }: { contentType: string }) {
  const context = useMemo(
    () => ({
      contentType,
      entityDetailPath: (
        name: string,
        tab?: string,
        filters?: Record<string, string>,
      ) => `/host/${name}?tab=${tab}&rule=${filters?.rule}`,
    }),
    [contentType],
  );
  const tabs = useNativeCatalogTabs(context);
  return (
    <>
      <div>Catalog</div>
      {tabs?.map(tab => (
        <div key={tab.id}>
          <button>{tab.label}</button>
          <ExtensionTabContent contribution={tab} />
        </div>
      ))}
    </>
  );
}
async function renderCatalog({
  allowed = true,
  enabled = true,
  contentType = 'playbook-repository',
} = {}) {
  const authorize = jest.fn(() =>
    allowed ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
  );
  await renderTestApp({
    features: [
      createFrontendPlugin({
        pluginId: 'portal',
        extensions: [
          createPortalContributionProvider(),
          PageBlueprint.make({
            name: 'catalog',
            params: {
              path: '/catalog',
              loader: async () =>
                compatWrapper(<Catalog contentType={contentType} />),
            },
          }),
        ],
      }),
      createFrontendPlugin({
        pluginId: 'scanner',
        extensions: [
          CatalogTabBlueprint.make({ name: 'settings', params: descriptor }),
        ],
      }),
    ],
    apis: [mockApis.permission({ authorize })],
    config: { scanner: { enabled } },
    initialRouteEntries: ['/catalog'],
  });
  return authorize;
}

describe('native catalog tabs', () => {
  beforeEach(() => jest.clearAllMocks());
  it('collects through NFS and preserves permission resource and host navigation', async () => {
    const authorize = await renderCatalog();
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(
      await screen.findByText(
        'Settings at /host/repo?tab=scanner.details&rule=R001',
      ),
    ).toBeTruthy();
    expect(authorize).toHaveBeenCalledWith({
      permission,
      resourceRef: 'scanner',
    });
    expect(descriptor.loader).toHaveBeenCalledTimes(1);
  });
  it.each([
    { allowed: false },
    { enabled: false },
    { contentType: 'execution-environment' },
  ])('filters before loading: %j', async options => {
    await renderCatalog(options);
    expect(await screen.findByText('Catalog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(descriptor.loader).not.toHaveBeenCalled();
  });
  it('rejects malformed attachments, ownership, scope and duplicate IDs', () => {
    expect(collectCatalogTabs([descriptor, descriptor])).toEqual([descriptor]);
    expect(
      collectCatalogTabs([
        { ...descriptor, attachment: 'entity.detail.tabs' as any },
      ]),
    ).toEqual([]);
    expect(
      collectCatalogTabs([
        { ...descriptor, manifest: { ...descriptor.manifest, id: 'other' } },
      ]),
    ).toEqual([]);
    const manifest = JSON.parse(JSON.stringify(descriptor.manifest));
    manifest.capabilities[0].entryPoints[0].appliesToContentTypes = ['unknown'];
    expect(collectCatalogTabs([{ ...descriptor, manifest }])).toEqual([]);
    expect(collectCatalogTabs([descriptor], '0.0.1')).toEqual([]);
  });
});
