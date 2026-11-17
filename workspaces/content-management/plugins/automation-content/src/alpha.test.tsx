import '@testing-library/jest-dom';
import type { Entity } from '@backstage/catalog-model';
import {
  createFrontendPlugin,
  type FrontendFeature,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import {
  EntityCardBlueprint,
  EntityContentLayoutBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import { catalogApiMock } from '@backstage/plugin-catalog-react/testUtils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { fireEvent, screen } from '@testing-library/react';
import {
  EntityDetailTabBlueprint,
  type EntityDetailTabDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { createPortalContributionProvider } from '@ansible/portal-extension-host/alpha';
import { eeHeaderLayout, eeOverviewLayout } from './alpha';
import { automationContentApiRef } from './api';
import { EEImageDetails } from './components/ExecutionEnvironments/EEImageDetails';
import {
  automationContentManifest,
  eeCapabilityId,
  eeDetailsEntryId,
} from './manifest';

const repository: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-repository',
    title: 'Example image repository',
    annotations: {
      'ansible.com/ee-repository': 'true',
      'ansible.com/registry': 'local',
      'ansible.com/repository': 'namespace/image',
    },
  },
  spec: { type: 'execution-environment-repository' },
};

const unrelated: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'service', title: 'Unrelated service' },
  spec: { type: 'service' },
};

const portal = createFrontendPlugin({
  pluginId: 'portal',
  extensions: [createPortalContributionProvider()],
});

const cards = createFrontendPlugin({
  pluginId: 'fixture-cards',
  extensions: [
    EntityCardBlueprint.make({
      name: 'overview-card',
      params: {
        type: 'content',
        loader: async () => <p>Existing overview card</p>,
      },
    }),
  ],
});

beforeEach(() => window.localStorage.clear());

function content(
  options: {
    loader?: EntityDetailTabDescriptor['loader'];
    disabled?: boolean;
    invalid?: boolean;
    scopedHeader?: boolean;
  } = {},
) {
  return createFrontendPlugin({
    pluginId: 'automation-content',
    extensions: [
      ...(options.scopedHeader ? [eeHeaderLayout] : []),
      eeOverviewLayout,
      EntityDetailTabBlueprint.make({
        name: 'image',
        disabled: options.disabled,
        params: {
          manifest: automationContentManifest,
          capabilityId: eeCapabilityId,
          entryPointId: options.invalid
            ? 'automation-content.missing'
            : eeDetailsEntryId,
          attachment: 'entity.detail.tabs',
          loader:
            options.loader ?? (async () => <p>Image contribution fixture</p>),
        },
      }),
    ],
  });
}

function renderEntity(
  options: {
    entity?: Entity;
    features?: FrontendFeature[];
    allowed?: boolean;
    provider?: boolean;
    contentApi?: Partial<typeof automationContentApiRef.T>;
    extraEntities?: Entity[];
  } = {},
) {
  return renderTestApp({
    features: [
      catalogPlugin,
      cards,
      ...(options.provider === false ? [] : [portal]),
      ...(options.features ?? [content()]),
    ],
    apis: [
      catalogApiMock({
        entities: [repository, unrelated, ...(options.extraEntities ?? [])],
      }),
      ...(options.contentApi
        ? [[automationContentApiRef, options.contentApi] as const]
        : []),
      mockApis.permission({
        authorize:
          options.allowed === false
            ? AuthorizeResult.DENY
            : AuthorizeResult.ALLOW,
      }),
    ],
    initialRouteEntries: [
      `/catalog/default/component/${
        (options.entity ?? repository).metadata.name
      }`,
    ],
  });
}

it('mounts only the validated image contribution under the stock favorite header', async () => {
  await renderEntity();
  expect(
    await screen.findByText('Image contribution fixture'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Existing overview card')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
  expect(
    await screen.findByRole('button', { name: 'Remove from favorites' }),
  ).toBeInTheDocument();
});

it.each(['denied', 'disabled', 'malformed', 'provider absent'] as const)(
  'shows the EE unavailable state when the image contribution is %s',
  async condition => {
    const loader = jest.fn(async () => <p>Image contribution fixture</p>);
    await renderEntity({
      allowed: condition !== 'denied',
      provider: condition !== 'provider absent',
      features: [
        content({
          loader,
          disabled: condition === 'disabled',
          invalid: condition === 'malformed',
        }),
      ],
    });
    expect(
      await screen.findByText(
        'Image details are unavailable for this account or deployment.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Existing overview card'),
    ).not.toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
  },
);

it('uses the scoped repository header without a favorite action', async () => {
  await renderEntity({ features: [content({ scopedHeader: true })] });
  expect(
    await screen.findByText('Image contribution fixture'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /to favorites/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
});

it('does not attach the image layout to an unrelated entity', async () => {
  const loader = jest.fn(async () => <p>Image contribution fixture</p>);
  await renderEntity({
    entity: unrelated,
    features: [content({ loader, scopedHeader: true })],
  });
  expect(
    await screen.findByRole('button', { name: 'Add to favorites' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('Existing overview card')).toBeInTheDocument();
  expect(
    screen.queryByText(/Image details are unavailable/),
  ).not.toBeInTheDocument();
  expect(loader).not.toHaveBeenCalled();
});

it('keeps the favorite usable when a detail import fails', async () => {
  const loader = jest.fn(async () => {
    throw new Error('private module detail');
  });
  await renderEntity({
    features: [content({ loader })],
  });
  expect(
    await screen.findByText(
      'Image details could not be loaded. Reload the page to try again.',
      undefined,
      { timeout: 4000 },
    ),
  ).toBeInTheDocument();
  expect(loader).toHaveBeenCalled();
  expect(screen.queryByText('private module detail')).not.toBeInTheDocument();
  expect(screen.queryByText('Existing overview card')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Add to favorites' }),
  ).toBeEnabled();
});

it('exposes a competing earlier stock layout instead of mounting a second route', async () => {
  const competitor = createFrontendPlugin({
    pluginId: 'earlier-layout',
    extensions: [
      EntityContentLayoutBlueprint.make({
        name: 'all-entities',
        params: { loader: async () => () => <p>Earlier catalog layout</p> },
      }),
    ],
  });
  const loader = jest.fn(async () => <p>Image contribution fixture</p>);
  await renderEntity({ features: [competitor, content({ loader })] });
  expect(await screen.findByText('Earlier catalog layout')).toBeInTheDocument();
  expect(loader).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Add to favorites' }),
  ).toBeEnabled();
});

it('keeps Overview available and retries only the failed contents request', async () => {
  const digest = 'sha256:example';
  const artifactRef = `local/namespace/image@${digest}`;
  const pullReference = 'registry.example/namespace/image:latest';
  const enumeration = {
    status: 'complete',
    source: 'build-time-manifest',
  } as const;
  const getEEArtifact = jest.fn().mockResolvedValue({
    ref: artifactRef,
    registry: 'local',
    repository: 'namespace/image',
    digest,
    pullReference,
    enumeration,
    signing: { state: 'signed', mechanisms: [] },
    collections: [],
  });
  const getEEArtifactContents = jest
    .fn()
    .mockRejectedValueOnce(new Error('Contents service unavailable'))
    .mockResolvedValue({ enumeration, collections: [], items: [] });
  await renderEntity({
    features: [
      content({
        loader: async ({ entity }) => <EEImageDetails entity={entity} />,
      }),
    ],
    contentApi: {
      getEERepository: async () => ({
        registry: 'local',
        repository: 'namespace/image',
        entityRef: 'component:default/test-repository',
        representativeRef: artifactRef,
        tags: [
          {
            tag: 'latest',
            digest,
            artifactRef,
            taggedPullReference: pullReference,
          },
        ],
        digests: [{ digest, artifactRef }],
      }),
      getEEArtifact,
      getEEArtifactContents,
      getRegistryStatus: async () => ({ items: [], manualSyncEnabled: false }),
    },
  });

  expect(await screen.findByText(digest)).toBeInTheDocument();
  expect(screen.getByText('Signed')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Copy pull reference' }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'All Content' }));
  expect(
    await screen.findByText('Image contents could not be loaded.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(
    await screen.findByText('This image contains no indexed collections.'),
  ).toBeInTheDocument();
  expect(getEEArtifactContents.mock.calls).toEqual([
    [artifactRef],
    [artifactRef],
  ]);
  expect(getEEArtifact.mock.calls).toEqual([[artifactRef]]);
});

it('links only the collection version included in the selected image digest', async () => {
  const digest = 'sha256:example';
  const artifactRef = `local/namespace/image@${digest}`;
  const collectionEntity = (name: string, version: string): Entity => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name,
      annotations: {
        'ansible.com/collection': 'ansible.netcommon',
        'ansible.com/version': version,
      },
    },
    spec: { type: 'ansible-collection' },
  });
  const selectedVersion = collectionEntity('netcommon-seven', '7.2.0');
  const otherVersion = collectionEntity('netcommon-eight', '8.0.0');
  const digestEntity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'digest-image',
      annotations: {
        'ansible.com/registry': 'local',
        'ansible.com/repository': 'namespace/image',
        'ansible.com/digest': digest,
      },
    },
    spec: { type: 'execution-environment' },
    relations: [
      { type: 'dependsOn', targetRef: 'component:default/netcommon-seven' },
      { type: 'dependsOn', targetRef: 'component:default/netcommon-eight' },
    ],
  };
  await renderEntity({
    extraEntities: [digestEntity, selectedVersion, otherVersion],
    features: [
      content({
        loader: async ({ entity }) => <EEImageDetails entity={entity} />,
      }),
    ],
    contentApi: {
      getEERepository: async () => ({
        registry: 'local',
        repository: 'namespace/image',
        entityRef: 'component:default/test-repository',
        representativeRef: artifactRef,
        tags: [
          {
            tag: 'latest',
            digest,
            artifactRef,
            taggedPullReference: 'local/namespace/image:latest',
          },
        ],
        digests: [{ digest, artifactRef }],
      }),
      getEEArtifact: async () => ({
        ref: artifactRef,
        registry: 'local',
        repository: 'namespace/image',
        digest,
        pullReference: artifactRef,
        tags: ['latest'],
        contentsKnown: true,
        enumeration: { status: 'complete', source: 'build-time-manifest' },
        collections: [],
      }),
      getEEArtifactContents: async () => ({
        enumeration: { status: 'complete', source: 'build-time-manifest' },
        collections: [
          {
            fqcn: 'ansible.netcommon',
            namespace: 'ansible',
            name: 'netcommon',
            version: '7.2.0',
            counts: { plugins: 8 },
          },
          {
            fqcn: 'ansible.utils',
            namespace: 'ansible',
            name: 'utils',
            version: '1.0.0',
            counts: {},
          },
        ],
        items: [],
      }),
      getRegistryStatus: async () => ({ items: [], manualSyncEnabled: false }),
    },
  });

  fireEvent.click(await screen.findByRole('tab', { name: 'All Content' }));
  expect(
    await screen.findByRole('link', { name: 'ansible.netcommon' }),
  ).toHaveAttribute('href', '/catalog/default/component/netcommon-seven');
  expect(screen.getByText('ansible.utils')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'ansible.utils' })).toBeNull();
  expect(screen.getByText('8 plugins')).toBeInTheDocument();
});
