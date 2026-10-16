import { useCallback, useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { compatWrapper } from '@backstage/core-compat-api';
import {
  PageBlueprint,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { renderTestApp, mockApis } from '@backstage/frontend-test-utils';
import {
  createPermission,
  AuthorizeResult,
} from '@backstage/plugin-permission-common';
import {
  CONTENT_TYPES,
  portalOperationsApiRef,
  contributionRegistry,
} from '@ansible/portal-extension-api';
import {
  EntityDetailTabBlueprint,
  EntityOverviewCardBlueprint,
  EntityActionBlueprint,
  type EntityDetailTabDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { createPortalContributionProvider } from './createPortalContributionProvider';
import { useNativeEntityPage } from './useNativeEntityPage';
import { NativeEntityActionMenu } from './NativeEntityActionMenu';
import {
  ExtensionTabContent,
  ExtensionCardContent,
} from '../ExtensionRenderer';

const manifest: EntityDetailTabDescriptor['manifest'] = {
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
      description: 'Quality',
      minimumHostApiVersion: '0.1.0',
      appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
      entryPoints: [
        {
          id: 'scanner.tab',
          kind: 'entity-tab',
          surface: 'entity-page',
          label: 'Quality',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
        },
        {
          id: 'scanner.card',
          kind: 'overview-slot',
          surface: 'entity-page',
          label: 'Summary',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          launches: { type: 'slot', targetSlot: 'entity.overview.secondary' },
        },
        {
          id: 'scanner.scan',
          kind: 'entity-action',
          surface: 'entity-page',
          label: 'Scan',
          requiredPermission: createPermission({
            name: 'scanner.scan',
            attributes: { action: 'create' },
          }),
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          launches: {
            type: 'operation',
            operationId: 'scanner.scan',
            followOn: { type: 'slot', targetSlot: 'entity.detail.tabs' },
          },
        },
      ],
    },
  ],
};
const tab: EntityDetailTabDescriptor = {
  manifest,
  capabilityId: 'scanner.quality',
  entryPointId: 'scanner.tab',
  attachment: 'entity.detail.tabs',
  loader: jest.fn(async context => (
    <div>Findings for {context.entity.metadata.name}</div>
  )),
};
const shared = { manifest, capabilityId: 'scanner.quality' };
const execute = jest.fn(async () => ({ result: { jobId: 'job-1' } }));

function ContentPage({
  name,
  contentType = CONTENT_TYPES.PLAYBOOK_REPOSITORY,
}: {
  name: string;
  contentType?: string;
}) {
  const [selected, setSelected] = useState(0);
  const onSelect = useCallback((index: number) => setSelected(index + 1), []);
  const entity = useState(() => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name },
  }))[0];
  const native = useNativeEntityPage(entity, contentType, onSelect);
  return (
    <>
      <Link to="/second">Second page</Link>
      <Link to="/ee">EE page</Link>
      <button onClick={() => setSelected(0)}>Overview</button>
      {native?.tabs.map((item, index) => (
        <button key={item.id} onClick={() => setSelected(index + 1)}>
          {item.label}
        </button>
      ))}
      {native && <NativeEntityActionMenu contributions={native} />}
      {selected === 0 && (
        <>
          <div>Built-in overview for {name}</div>
          {native?.cards.map(card => (
            <ExtensionCardContent
              key={card.id}
              contribution={card}
              entity={entity}
            />
          ))}
        </>
      )}
      {native?.tabs.map((item, index) =>
        selected === index + 1 ? (
          <ExtensionTabContent
            key={item.id}
            contribution={item}
            entity={entity}
          />
        ) : null,
      )}
    </>
  );
}

function renderPages(disabled = false) {
  return renderTestApp({
    features: [
      createFrontendPlugin({
        pluginId: 'portal',
        extensions: [createPortalContributionProvider()],
      }),
      createFrontendPlugin({
        pluginId: 'content',
        extensions: ['first', 'second', 'ee'].map(name =>
          PageBlueprint.make({
            name,
            params: {
              path: `/${name}`,
              loader: async () =>
                compatWrapper(
                  <ContentPage
                    name={name}
                    contentType={
                      name === 'ee'
                        ? CONTENT_TYPES.EXECUTION_ENVIRONMENT_DEFINITION
                        : undefined
                    }
                  />,
                ),
            },
          }),
        ),
      }),
      createFrontendPlugin({
        pluginId: 'scanner',
        extensions: [
          EntityDetailTabBlueprint.make({
            name: 'quality',
            disabled,
            params: tab,
          }),
          EntityOverviewCardBlueprint.make({
            name: 'summary',
            disabled,
            params: {
              ...shared,
              entryPointId: 'scanner.card',
              attachment: 'entity.overview.secondary',
              detailsEntryPointId: 'scanner.tab',
              loader: async context => (
                <button onClick={context.openDetails}>
                  Open findings for {context.entity.metadata.name}
                </button>
              ),
            },
          }),
          EntityActionBlueprint.make({
            name: 'scan',
            disabled,
            params: {
              ...shared,
              entryPointId: 'scanner.scan',
              attachment: 'entity.actions',
              followOnEntryPointId: 'scanner.tab',
            },
          }),
        ],
      }),
    ],
    apis: [
      mockApis.permission({ authorize: AuthorizeResult.ALLOW }),
      [portalOperationsApiRef, { execute }],
    ],
    initialRouteEntries: ['/first'],
  });
}

describe('Shared NFS contribution provider', () => {
  beforeEach(() => jest.clearAllMocks());
  it('shares contributions across plugin-owned routes and preserves built-in overview/navigation', async () => {
    renderPages();
    await screen.findByText('Built-in overview for first');
    fireEvent.click(await screen.findByText('Open findings for first'));
    await screen.findByText('Findings for first');
    fireEvent.click(screen.getByText('Second page'));
    await screen.findByText('Built-in overview for second');
    fireEvent.click(await screen.findByText('Open findings for second'));
    await screen.findByText('Findings for second');
    expect(contributionRegistry.getManifests()).toEqual([]);
  });
  it('launches an operation for the current subject and refreshes the existing results tab', async () => {
    renderPages();
    fireEvent.click(await screen.findByText('Quality'));
    await screen.findByText('Findings for first');
    fireEvent.click(await screen.findByText('Actions'));
    fireEvent.click(await screen.findByText('Scan'));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('scanner.scan', {
        subject: { entityRef: 'component:default/first' },
      }),
    );
    await waitFor(() => expect(tab.loader).toHaveBeenCalledTimes(2));
  });
  it('filters unsupported entities before lazy-loading contributions', async () => {
    renderPages();
    await screen.findByText('Built-in overview for first');
    fireEvent.click(screen.getByText('EE page'));
    await screen.findByText('Built-in overview for ee');
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(tab.loader).not.toHaveBeenCalled();
  });
  it('honors NFS extension disabling on every consumer route', async () => {
    renderPages(true);
    await screen.findByText('Built-in overview for first');
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Second page'));
    await screen.findByText('Built-in overview for second');
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(tab.loader).not.toHaveBeenCalled();
  });
});
