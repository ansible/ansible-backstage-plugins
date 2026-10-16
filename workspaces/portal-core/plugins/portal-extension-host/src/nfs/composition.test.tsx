import { createPortalContributionProvider } from './createPortalContributionProvider';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { compatWrapper } from '@backstage/core-compat-api';
import {
  createExtension,
  createExtensionDataRef,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import {
  CONTENT_TYPES,
  contributionRegistry,
} from '@ansible/portal-extension-api';
import {
  EntityDetailTabBlueprint,
  PORTAL_ENTITY_PAGE_ATTACHMENT,
  type EntityDetailTabDescriptor,
  type EntityContributionContext,
} from '@ansible/portal-extension-api/alpha';
import { createPortalEntityPage } from './createPortalEntityPage';
import { PortalEntityTabs } from './PortalEntityTabs';

const context: EntityContributionContext = {
  entity: {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'test-repo' },
  },
  contentType: CONTENT_TYPES.PLAYBOOK_REPOSITORY,
  sourceKinds: ['git'],
};

function descriptor(
  overrides: Partial<EntityDetailTabDescriptor> = {},
): EntityDetailTabDescriptor {
  return {
    manifest: {
      id: 'scanner',
      version: '1.0.0',
      apiVersion: '0.1.0',
      entitlements: [],
      capabilities: [
        {
          id: 'scanner.quality',
          ownerPlugin: 'scanner',
          experienceId: 'content-quality-assessment',
          displayName: 'Quality',
          description: 'Scan quality',
          minimumHostApiVersion: '0.1.0',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          entryPoints: [
            {
              id: 'scanner.quality.tab',
              kind: 'entity-tab',
              surface: 'entity-page',
              label: 'Quality',
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
            },
          ],
        },
      ],
    },
    capabilityId: 'scanner.quality',
    entryPointId: 'scanner.quality.tab',
    attachment: 'entity.detail.tabs',
    loader: jest.fn(async current => (
      <div>Quality for {current.entity.metadata.name}</div>
    )),
    ...overrides,
  };
}

function compose(
  tab: EntityDetailTabDescriptor,
  options: {
    context?: EntityContributionContext;
    disabled?: boolean;
    deny?: boolean;
    availableExperiences?: readonly string[];
    extraTabs?: EntityDetailTabDescriptor[];
  } = {},
) {
  const entityPage = createPortalEntityPage({
    path: '/entity',
    loader: async tabs =>
      compatWrapper(
        <>
          <div>Host overview</div>
          <PortalEntityTabs
            tabs={tabs}
            context={options.context ?? context}
            availableExperiences={options.availableExperiences}
          />
        </>,
      ),
  });
  return renderTestApp({
    features: [
      createFrontendPlugin({
        pluginId: 'portal',
        extensions: [createPortalContributionProvider(), entityPage],
      }),
      createFrontendPlugin({
        pluginId: 'scanner',
        extensions: [tab, ...(options.extraTabs ?? [])].map((params, i) =>
          EntityDetailTabBlueprint.make({
            name: `quality-${i}`,
            disabled: options.disabled,
            params,
          }),
        ),
      }),
    ],
    apis: [
      mockApis.permission({
        authorize: options.deny ? AuthorizeResult.DENY : AuthorizeResult.ALLOW,
      }),
    ],
    initialRouteEntries: ['/entity'],
    config: { ansible: { apme: { enabled: true } } },
  });
}

async function settled() {
  await screen.findByText('Host overview');
  await waitFor(() =>
    expect(
      screen.queryByLabelText('Loading available tabs'),
    ).not.toBeInTheDocument(),
  );
}

describe('Portal NFS composition', () => {
  it.each(['scanner', 'impersonator'])(
    'matches independent data refs by ID and verifies %s ownership',
    async pluginId => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // A new reference object models a separately bundled contract library.
        const remoteRef =
          createExtensionDataRef<EntityDetailTabDescriptor>().with({
            id: 'ansible.portal.entity-detail-tab.v1',
          });
        const tab = descriptor();
        const remote = createExtension({
          name: 'independent',
          attachTo: PORTAL_ENTITY_PAGE_ATTACHMENT,
          output: [remoteRef],
          factory: () => [remoteRef(tab)],
        });
        const page = createPortalEntityPage({
          path: '/entity',
          loader: async tabs =>
            compatWrapper(
              <>
                <div>Host overview</div>
                <PortalEntityTabs tabs={tabs} context={context} />
              </>,
            ),
        });
        renderTestApp({
          features: [
            createFrontendPlugin({
              pluginId: 'portal',
              extensions: [createPortalContributionProvider(), page],
            }),
            createFrontendPlugin({ pluginId, extensions: [remote] }),
          ],
          initialRouteEntries: ['/entity'],
        });
        await settled();
        await waitFor(() =>
          expect(Boolean(screen.queryByText('Quality for test-repo'))).toBe(
            pluginId === 'scanner',
          ),
        );
        expect(tab.loader).toHaveBeenCalledTimes(
          pluginId === 'scanner' ? 1 : 0,
        );
        expect(
          warn.mock.calls.some(([message]) =>
            String(message).startsWith('[Portal NFS] Rejected entity tab'),
          ),
        ).toBe(pluginId === 'impersonator');
      } finally {
        warn.mockRestore();
      }
    },
  );

  it('discovers a separately declared plugin without singleton registration', async () => {
    const before = contributionRegistry.getManifests();
    const tab = descriptor();
    compose(tab);
    expect(
      await screen.findByText('Quality for test-repo'),
    ).toBeInTheDocument();
    expect(tab.loader).toHaveBeenCalledWith(context);
    expect(contributionRegistry.getManifests()).toEqual(before);
    expect(screen.getByRole('tab', { name: 'Quality' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it.each([
    [
      'unsupported type',
      {
        context: {
          ...context,
          contentType: CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE,
        },
      },
      {},
    ],
    ['disabled extension', { disabled: true }, {}],
    ['disabled experience', { availableExperiences: [] }, {}],
    ['unsupported source', {}, { appliesToSourceKinds: ['hub'] }],
    ['disabled config', {}, { enabledByConfig: 'missing.enabled' }],
    ['false predicate', {}, { isApplicable: async () => false }],
  ] as const)(
    'does not load a tab for %s',
    async (_name, options, overrides) => {
      const tab = descriptor(overrides);
      compose(tab, options);
      await settled();
      expect(tab.loader).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('tab', { name: 'Quality' }),
      ).not.toBeInTheDocument();
    },
  );

  it('checks permission before evaluating the predicate or loader', async () => {
    const tab = descriptor({ isApplicable: jest.fn(() => true) });
    tab.manifest.capabilities[0].entryPoints[0].requiredPermission =
      createPermission({
        name: 'quality.read',
        attributes: { action: 'read' },
      });
    compose(tab, { deny: true });
    await settled();
    expect(tab.isApplicable).not.toHaveBeenCalled();
    expect(tab.loader).not.toHaveBeenCalled();
  });

  it('filters a mismatched type before invoking a predicate', async () => {
    const tab = descriptor({ isApplicable: jest.fn(() => true) });
    compose(tab, {
      context: { ...context, contentType: CONTENT_TYPES.COLLECTION },
    });
    await settled();
    expect(tab.isApplicable).not.toHaveBeenCalled();
  });

  it('requires a host entitlement resolver before loading an entitled tab', async () => {
    const tab = descriptor({ requiredEntitlements: ['scanner.enabled'] });
    tab.manifest.entitlements = [
      {
        id: 'scanner.enabled',
        displayName: 'Scanner',
        description: 'Enable scanning',
        scope: 'organization',
        permissionName: 'scanner.enabled',
      },
    ];
    compose(tab);
    await settled();
    expect(tab.loader).not.toHaveBeenCalled();
  });

  it('sorts tabs and loads only the selected contribution', async () => {
    const first = descriptor();
    const second = descriptor({
      entryPointId: 'scanner.quality.history',
      loader: jest.fn(async () => <div>Scan history</div>),
    });
    second.manifest.capabilities[0].entryPoints[0] = {
      ...second.manifest.capabilities[0].entryPoints[0],
      id: second.entryPointId,
      label: 'History',
      order: 20,
    };
    compose(second, { extraTabs: [first] });
    expect(
      await screen.findByText('Quality for test-repo'),
    ).toBeInTheDocument();
    expect(second.loader).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByText('Scan history')).toBeInTheDocument();
    expect(first.loader).toHaveBeenCalledTimes(1);
  });

  it.each(['version', 'region', 'scope', 'owner', 'entry'] as const)(
    'rejects invalid %s without breaking the host',
    async invalid => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const tab = descriptor();
        if (invalid === 'version') tab.manifest.apiVersion = '2.0.0';
        if (invalid === 'region') tab.attachment = 'arbitrary' as any;
        if (invalid === 'scope')
          tab.manifest.capabilities[0].entryPoints[0].appliesToContentTypes = [
            'unknown',
          ];
        if (invalid === 'owner')
          tab.manifest.capabilities[0].ownerPlugin = 'other';
        if (invalid === 'entry') tab.entryPointId = 'missing';
        compose(tab);
        await settled();
        expect(tab.loader).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );

  it('isolates a rejected component import from the host overview', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      compose(
        descriptor({
          loader: async () => {
            throw new Error('Remote failed');
          },
        }),
      );
      expect(await screen.findByText(/failed to render/)).toBeInTheDocument();
      expect(screen.getByText('Host overview')).toBeInTheDocument();
    } finally {
      error.mockRestore();
    }
  });
});
