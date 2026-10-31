import { useEffect, useState, type ReactNode } from 'react';
import { screen, within } from '@testing-library/react';
import { MockConfigApi } from '@backstage/test-utils';
import { useApi } from '@backstage/core-plugin-api';
import { compatWrapper } from '@backstage/core-compat-api';
import { resolveAsyncFeatures } from '@backstage/frontend-defaults';
import { renderTestApp } from '@backstage/frontend-test-utils';
import {
  createFrontendPlugin,
  createRouteRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import portalPlugin from '@ansible/portal-core/alpha';
import portalNavigation from '@ansible/portal-core/app-nav';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import {
  EntityDetailTabBlueprint,
  portalContributionsApiRef,
  type EntityDetailTabDescriptor,
} from '@ansible/portal-extension-api/alpha';

const mockScaffolderFactory = jest.fn();
const mockApmeFactory = jest.fn();
const mockAnsibleFactory = jest.fn();

jest.mock('@ansible/portal-scaffolder/alpha', () => {
  mockScaffolderFactory();
  return {
    __esModule: true,
    default: jest
      .requireActual('@backstage/frontend-plugin-api')
      .createFrontendPlugin({ pluginId: 'portal-scaffolder', extensions: [] }),
  };
});
jest.mock('@ansible/plugin-backstage-apme/alpha', () => {
  mockApmeFactory();
  return {
    __esModule: true,
    default: jest
      .requireActual('@backstage/frontend-plugin-api')
      .createFrontendPlugin({ pluginId: 'apme', extensions: [] }),
  };
});
jest.mock('@ansible/plugin-backstage-rhaap/alpha', () => {
  mockAnsibleFactory();
  return {
    __esModule: true,
    default: jest
      .requireActual('@backstage/frontend-plugin-api')
      .createFrontendPlugin({ pluginId: 'ansible', extensions: [] }),
  };
});

describe('development contributor selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Fresh module registries prove which factories execute without resetting
  // React's shared registry used by the native rendering tests below.
  async function withFreshComposition(
    test: (composition: typeof import('./composition')) => Promise<void>,
  ) {
    await jest.isolateModulesAsync(async () => {
      await test(await import('./composition'));
    });
  }

  it.each([undefined, 'full', 'scaffolder', 'core'])(
    'resolves the configured profile %s',
    async profile => {
      await withFreshComposition(async ({ resolveDevelopmentProfile }) => {
        const config = new MockConfigApi(
          profile === undefined ? {} : { portal: { development: { profile } } },
        );
        expect(resolveDevelopmentProfile(config)).toBe(profile ?? 'full');
      });
    },
  );

  it.each([
    [undefined, ['portal-scaffolder', 'apme', 'ansible'], 1, 1, 1],
    ['full', ['portal-scaffolder', 'apme', 'ansible'], 1, 1, 1],
    ['scaffolder', ['portal-scaffolder'], 1, 0, 0],
    ['core', [], 0, 0, 0],
  ] as const)(
    'loads only selected contributor modules for %s',
    async (profile, expectedIds, scaffolderLoads, apmeLoads, ansibleLoads) => {
      await withFreshComposition(async ({ optionalContributorLoader }) => {
        const { features } = await resolveAsyncFeatures({
          config: new MockConfigApi(
            profile === undefined
              ? {}
              : { portal: { development: { profile } } },
          ),
          features: [optionalContributorLoader],
        });
        expect(
          features.map(feature =>
            'pluginId' in feature ? feature.pluginId : null,
          ),
        ).toEqual(expectedIds);
        expect(mockScaffolderFactory).toHaveBeenCalledTimes(scaffolderLoads);
        expect(mockApmeFactory).toHaveBeenCalledTimes(apmeLoads);
        expect(mockAnsibleFactory).toHaveBeenCalledTimes(ansibleLoads);
      });
    },
  );

  it.each(['unknown', '', 'CORE'])(
    'rejects invalid profile %j before importing any contributor',
    async profile => {
      await withFreshComposition(
        async ({ optionalContributorLoader, resolveDevelopmentProfile }) => {
          const config = new MockConfigApi({
            portal: { development: { profile } },
          });
          expect(() => resolveDevelopmentProfile(config)).toThrow(
            /portal.development.profile/,
          );
          await expect(
            resolveAsyncFeatures({
              config,
              features: [optionalContributorLoader],
            }),
          ).rejects.toThrow(/portal.development.profile/);
          expect(mockScaffolderFactory).not.toHaveBeenCalled();
          expect(mockApmeFactory).not.toHaveBeenCalled();
          expect(mockAnsibleFactory).not.toHaveBeenCalled();
        },
      );
    },
  );
});

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'independent-repository' },
};
const manifest: EntityDetailTabDescriptor['manifest'] = {
  id: 'independent',
  version: '1.0.0',
  apiVersion: '0.1.0',
  entitlements: [],
  capabilities: [
    {
      id: 'independent.quality',
      ownerPlugin: 'independent',
      experienceId: 'content-quality-assessment',
      displayName: 'Independent quality',
      description: 'A contribution with no Templates dependency',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
      entryPoints: [
        {
          id: 'independent.findings',
          kind: 'entity-tab',
          surface: 'entity-page',
          label: 'Independent findings',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
        },
      ],
    },
  ],
};
const contributionLoader = jest.fn(async () => (
  <div>Independent findings loaded</div>
));

function ContributionContent({
  descriptor,
}: {
  descriptor: EntityDetailTabDescriptor;
}) {
  const [content, setContent] = useState<ReactNode>(null);
  useEffect(() => {
    let active = true;
    descriptor
      .loader({ entity, contentType: CONTENT_TYPES.PLAYBOOK_REPOSITORY })
      .then(element => {
        if (active) setContent(element);
      });
    return () => {
      active = false;
    };
  }, [descriptor]);
  return <>{content}</>;
}

function IndependentPage() {
  const contributions = useApi(portalContributionsApiRef);
  return (
    <>
      <h1>Independent content</h1>
      {contributions.tabs.map(tab => (
        <ContributionContent key={tab.entryPointId} descriptor={tab} />
      ))}
    </>
  );
}

const independentPlugin = createFrontendPlugin({
  pluginId: 'independent',
  extensions: [
    PageBlueprint.make({
      params: {
        path: '/independent',
        routeRef: createRouteRef(),
        title: 'Independent content',
        icon: <span aria-hidden="true">I</span>,
        loader: async () => compatWrapper(<IndependentPage />),
      },
    }),
    EntityDetailTabBlueprint.make({
      name: 'findings',
      params: {
        manifest,
        capabilityId: 'independent.quality',
        entryPointId: 'independent.findings',
        attachment: 'entity.detail.tabs',
        loader: contributionLoader,
      },
    }),
  ],
});

describe('native host without portal-scaffolder', () => {
  it('provides a usable root fallback without any contributor', async () => {
    await renderTestApp({
      features: [portalPlugin],
      initialRouteEntries: ['/'],
    });
    expect(
      await screen.findByText('Welcome to Automation Portal'),
    ).toBeTruthy();
    expect(screen.queryByText(/404/)).toBeNull();
  });

  it('lands on and renders an independently declared page and contribution', async () => {
    await renderTestApp({
      features: [portalPlugin, portalNavigation, independentPlugin],
      config: {
        app: { extensions: [{ 'nav-content:app/portal': true }] },
        portal: {
          landingPage: '/independent',
          navigation: {
            items: [
              { id: 'independent', page: 'page:independent' },
              {
                id: 'templates',
                page: 'page:portal-scaffolder',
                title: 'Templates',
              },
            ],
          },
        },
      },
      initialRouteEntries: ['/'],
    });
    expect(
      await screen.findByRole('heading', { name: 'Independent content' }),
    ).toBeTruthy();
    expect(await screen.findByText('Independent findings loaded')).toBeTruthy();
    expect(
      within(screen.getByRole('navigation', { name: 'sidebar nav' }))
        .getByRole('link', { name: 'Independent content' })
        .getAttribute('href'),
    ).toBe('/independent');
    expect(screen.queryByRole('link', { name: 'Templates' })).toBeNull();
    expect(contributionLoader).toHaveBeenCalledWith(
      expect.objectContaining({
        entity,
        contentType: CONTENT_TYPES.PLAYBOOK_REPOSITORY,
      }),
    );
    expect(screen.queryByText(/404/)).toBeNull();
  });
});
