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
      catalogApiMock({ entities: [repository, unrelated] }),
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

it('mounts a validated image contribution beside accepted cards under the stock favorite header', async () => {
  await renderEntity();
  expect(await screen.findByText('Existing overview card')).toBeInTheDocument();
  expect(
    await screen.findByText('Image contribution fixture'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
  expect(
    await screen.findByRole('button', { name: 'Remove from favorites' }),
  ).toBeInTheDocument();
});

it.each(['denied', 'disabled', 'malformed', 'provider absent'] as const)(
  'keeps the stock overview usable when the image contribution is %s',
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
      await screen.findByText('Existing overview card'),
    ).toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
  },
);

it('uses the repository header with the same favorite store', async () => {
  await renderEntity({ features: [content({ scopedHeader: true })] });
  const favorite = await screen.findByRole('button', {
    name: 'Add Example image repository to favorites',
  });
  fireEvent.click(favorite);
  expect(
    await screen.findByRole('button', {
      name: 'Remove Example image repository from favorites',
    }),
  ).toBeInTheDocument();
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

it('keeps the favorite and existing cards usable when a detail import fails', async () => {
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
  expect(await screen.findByText('Existing overview card')).toBeInTheDocument();
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
