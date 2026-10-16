import { createPortalContributionProvider } from './createPortalContributionProvider';
import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { compatWrapper } from '@backstage/core-compat-api';
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import {
  EntityOverviewCardBlueprint,
  EntityDetailTabBlueprint,
  type EntityOverviewCardDescriptor,
  type EntityOverviewCardContext,
  type EntityDetailTabDescriptor,
  type EntityContributionContext,
} from '@ansible/portal-extension-api/alpha';
import { createPortalEntityPage } from './createPortalEntityPage';
import { PortalEntitySurface } from './PortalEntityActions';
import { collectEntityOverviewCards } from './validateEntityOverviewCard';

const context: EntityContributionContext = {
  entity: {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'repo' },
  },
  contentType: CONTENT_TYPES.PLAYBOOK_REPOSITORY,
  sourceKinds: ['git'],
};
const permission = createPermission({
  name: 'scanner.view',
  attributes: { action: 'read' },
});
function descriptor(
  id = 'summary',
  region: EntityOverviewCardDescriptor['attachment'] = 'entity.overview.secondary',
  order = 10,
): EntityOverviewCardDescriptor {
  return {
    manifest: {
      id: 'scanner',
      apiVersion: '0.1.0',
      version: '1.0.0',
      entitlements: [
        {
          id: 'scanner.available',
          displayName: 'Available',
          description: 'Available',
          scope: 'organization',
          permissionName: 'scanner.use',
        },
      ],
      capabilities: [
        {
          id: 'scanner.quality',
          ownerPlugin: 'scanner',
          experienceId: 'content-quality-assessment',
          displayName: 'Quality',
          description: 'Quality',
          minimumHostApiVersion: '0.1.0',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          entryPoints: [
            {
              id: 'scanner.quality.overview',
              kind: 'entity-tab',
              surface: 'entity-page',
              label: 'Overview',
              order: 0,
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
            },
            {
              id: 'scanner.quality.results',
              kind: 'entity-tab',
              surface: 'entity-page',
              label: 'Quality',
              order: 10,
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
            },
            {
              id: `scanner.quality.${id}`,
              kind: 'overview-slot',
              surface: 'entity-page',
              label: `Summary ${id}`,
              order,
              requiredPermission: permission,
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: { type: 'slot', targetSlot: region },
            },
          ],
        },
      ],
    },
    capabilityId: 'scanner.quality',
    entryPointId: `scanner.quality.${id}`,
    attachment: region,
    detailsEntryPointId: 'scanner.quality.results',
    requiredEntitlements: ['scanner.available'],
    enabledByConfig: 'scanner.enabled',
    loader: jest.fn(async ({ openDetails }: EntityOverviewCardContext) => (
      <button disabled={!openDetails} onClick={openDetails}>
        View Quality {id}
      </button>
    )),
  };
}

describe('native overview cards', () => {
  const check = jest.fn();
  async function compose(
    card: EntityOverviewCardDescriptor,
    options: {
      contentType?: string;
      enabled?: boolean;
      deny?: boolean;
      experiences?: string[];
      missingResolver?: boolean;
      missingResults?: boolean;
      extraCards?: EntityOverviewCardDescriptor[];
      pluginId?: string;
    } = {},
  ) {
    const tabs: EntityDetailTabDescriptor[] = ['overview', 'results']
      .filter(id => id !== 'results' || !options.missingResults)
      .map(id => ({
        ...card,
        attachment: 'entity.detail.tabs',
        entryPointId: `scanner.quality.${id}`,
        requiredEntitlements: [],
        enabledByConfig: undefined,
        isApplicable: undefined,
        loader: async () => (
          <div>{id === 'overview' ? 'Overview tab' : 'Detailed Quality'}</div>
        ),
      }));
    const current = {
      ...context,
      contentType: options.contentType ?? context.contentType,
    };
    const page = createPortalEntityPage({
      path: '/entity',
      loader: async (collectedTabs, actions, cards) =>
        compatWrapper(
          <>
            <div>Host entity overview</div>
            <PortalEntitySurface
              tabs={collectedTabs}
              actions={actions}
              cards={cards}
              context={current}
              availableExperiences={options.experiences}
              checkEntitlement={options.missingResolver ? undefined : check}
            />
          </>,
        ),
    });
    await renderTestApp({
      features: [
        createFrontendPlugin({
          pluginId: 'portal',
          extensions: [createPortalContributionProvider(), page],
        }),
        createFrontendPlugin({
          pluginId: options.pluginId ?? 'scanner',
          extensions: [
            ...[card, ...(options.extraCards ?? [])].map((params, i) =>
              EntityOverviewCardBlueprint.make({ name: `card-${i}`, params }),
            ),
            ...tabs.map((params, i) =>
              EntityDetailTabBlueprint.make({ name: `tab-${i}`, params }),
            ),
          ],
        }),
      ],
      apis: [
        mockApis.permission({
          authorize: options.deny
            ? AuthorizeResult.DENY
            : AuthorizeResult.ALLOW,
        }),
      ],
      config: { scanner: { enabled: options.enabled ?? true } },
      initialRouteEntries: ['/entity'],
    });
    await screen.findByText('Host entity overview');
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Loading available overview cards'),
      ).not.toBeInTheDocument(),
    );
  }
  beforeEach(() => {
    jest.clearAllMocks();
    check.mockResolvedValue(true);
  });
  it('discovers cards through NFS, supplies the subject and host navigation, and opens Quality without mutation', async () => {
    const card = descriptor();
    await compose(card);
    const button = await screen.findByRole('button', {
      name: 'View Quality summary',
    });
    expect(
      within(
        screen.getByRole('region', { name: 'entity.overview.secondary' }),
      ).getByRole('button'),
    ).toBe(button);
    expect(card.loader).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: context.entity,
        contentType: context.contentType,
        openDetails: expect.any(Function),
      }),
    );
    fireEvent.click(button);
    expect(await screen.findByText('Detailed Quality')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Quality' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
  it.each([
    { contentType: CONTENT_TYPES.COLLECTION },
    { enabled: false },
    { deny: true },
    { experiences: [] },
    { missingResolver: true },
  ])('filters before calling a loader: %j', async options => {
    const card = descriptor();
    await compose(card, options);
    expect(card.loader).not.toHaveBeenCalled();
  });
  it.each(['deny', 'error'])('fails closed on entitlement %s', async mode => {
    if (mode === 'deny') check.mockResolvedValue(false);
    else check.mockRejectedValue(new Error('unavailable'));
    const card = descriptor();
    await compose(card);
    expect(card.loader).not.toHaveBeenCalled();
  });
  it.each(['source', 'predicate', 'predicate-error'])(
    'contains or filters %s',
    async mode => {
      const card = descriptor();
      if (mode === 'source') card.appliesToSourceKinds = ['oci'];
      card.isApplicable = jest.fn(() => {
        if (mode === 'predicate-error') throw new Error('broken');
        return mode === 'source';
      });
      await compose(card);
      expect(card.loader).not.toHaveBeenCalled();
      expect(card.isApplicable).toHaveBeenCalledTimes(
        mode === 'source' ? 0 : 1,
      );
    },
  );
  it('keeps the summary but withholds navigation when the declared details tab is unavailable', async () => {
    const card = descriptor();
    await compose(card, { missingResults: true });
    expect(
      await screen.findByRole('button', { name: 'View Quality summary' }),
    ).toBeDisabled();
    expect(card.loader).toHaveBeenCalledWith(
      expect.objectContaining({ openDetails: undefined }),
    );
  });
  it('orders cards within host-owned regions', async () => {
    await compose(descriptor('late', 'entity.overview.main', 20), {
      extraCards: [
        descriptor('early', 'entity.overview.main', 1),
        descriptor('side'),
      ],
    });
    const main = await screen.findByRole('region', {
      name: 'entity.overview.main',
    });
    await waitFor(() =>
      expect(within(main).getAllByRole('button')).toHaveLength(2),
    );
    expect(
      within(main)
        .getAllByRole('button')
        .map(button => button.textContent),
    ).toEqual(['View Quality early', 'View Quality late']);
    expect(
      await screen.findByRole('region', { name: 'entity.overview.secondary' }),
    ).toBeInTheDocument();
  });
  it.each(['load', 'render'])(
    'contains a card %s failure without breaking siblings or tabs',
    async mode => {
      const card = descriptor('broken');
      function Broken(): JSX.Element {
        throw new Error('render failed');
      }
      card.loader =
        mode === 'load'
          ? jest.fn().mockRejectedValue(new Error('load failed'))
          : async () => <Broken />;
      await compose(card, { extraCards: [descriptor('healthy')] });
      expect(
        await screen.findByText(
          'Extension "scanner.quality.broken" failed to render.',
        ),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'View Quality healthy' }),
      ).toBeInTheDocument();
      expect(await screen.findByText('Overview tab')).toBeInTheDocument();
    },
  );
  it('uses actual plugin ownership rather than caller claims', async () => {
    const card = descriptor();
    await compose(card, { pluginId: 'impersonator' });
    expect(card.loader).not.toHaveBeenCalled();
  });
});

describe('overview card validation', () => {
  it('rejects duplicates independently', () => {
    const card = descriptor();
    expect(collectEntityOverviewCards([card, card])).toEqual([card]);
  });
  it.each([
    'region',
    'slot',
    'kind',
    'api',
    'content',
    'scope',
    'destination',
    'loader',
  ])('rejects an invalid %s', field => {
    const card = descriptor();
    const entry = card.manifest.capabilities[0].entryPoints[2];
    switch (field) {
      case 'region':
        card.attachment = 'plugin.private' as 'entity.overview.main';
        break;
      case 'slot':
        entry.launches = { type: 'slot', targetSlot: 'plugin.private' };
        break;
      case 'kind':
        entry.kind = 'entity-tab';
        break;
      case 'api':
        card.manifest.apiVersion = '2.0.0';
        break;
      case 'content':
        entry.appliesToContentTypes = ['not-a-type'];
        break;
      case 'scope':
        entry.appliesToContentTypes = [CONTENT_TYPES.COLLECTION];
        break;
      case 'destination':
        card.detailsEntryPointId = 'scanner.missing';
        break;
      case 'loader':
        card.loader =
          undefined as unknown as EntityOverviewCardDescriptor['loader'];
        break;
      default:
        break;
    }
    expect(collectEntityOverviewCards([card])).toEqual([]);
  });
});
