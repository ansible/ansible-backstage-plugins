import {
  ApiBlueprint,
  createFrontendPlugin,
  PageBlueprint,
  PluginHeaderActionBlueprint,
  SubPageBlueprint,
  type ExtensionDefinition,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import {
  EntityContentLayoutBlueprint,
  EntityHeaderLayoutBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import { RiBox3Line } from '@remixicon/react';
import {
  EE_REPOSITORY_ANNOTATIONS,
  EE_REPOSITORY_ENTITY_TYPE,
} from '@ansible/automation-content-common/eeRepository';
import { EntityDetailTabBlueprint } from '@ansible/portal-extension-api/alpha';
import { automationContentApiFactory } from './api';
import {
  automationContentManifest,
  eeCapabilityId,
  eeDetailsEntryId,
} from './manifest';

import { eeRouteRef } from './routes';

function isEERepository(entity: Entity): boolean {
  return (
    entity.kind.toLowerCase() === 'component' &&
    entity.spec?.type === EE_REPOSITORY_ENTITY_TYPE &&
    entity.metadata.annotations?.[EE_REPOSITORY_ANNOTATIONS.marker] === 'true'
  );
}

export const eeHeaderLayout: ExtensionDefinition =
  EntityHeaderLayoutBlueprint.make({
    name: 'ee-repository',
    params: {
      filter: isEERepository,
      loader: async () =>
        (await import('./components/ExecutionEnvironments/EERepositoryHeader'))
          .EERepositoryHeader,
    },
  });

export const eeOverviewLayout: ExtensionDefinition =
  EntityContentLayoutBlueprint.make({
    name: 'ee-repository',
    params: {
      filter: isEERepository,
      loader: async () =>
        (await import('./components/ExecutionEnvironments/EEEntityContent'))
          .EEEntityContent,
    },
  });

const automationContentPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'automation-content',
  routes: { ee: eeRouteRef },
  extensions: [
    ApiBlueprint.make({
      params: define => define(automationContentApiFactory),
    }),
    PageBlueprint.make({
      name: 'ee',
      params: {
        path: '/content/ee',
        routeRef: eeRouteRef,
        title: 'Execution Environments',
        icon: <RiBox3Line />,
      },
    }),
    SubPageBlueprint.make({
      name: 'images',
      attachTo: { id: 'page:automation-content/ee', input: 'pages' },
      params: {
        path: 'images',
        title: 'Images',
        loader: async () => {
          const { EEImagesPage } = await import(
            './components/ExecutionEnvironments/EEImagesPage'
          );
          return <EEImagesPage />;
        },
      },
    }),
    PluginHeaderActionBlueprint.make({
      name: 'execution-environments',
      params: {
        loader: async () => {
          const { EEHeaderActions } = await import(
            './components/ExecutionEnvironments/EEHeaderActions'
          );
          return <EEHeaderActions />;
        },
      },
    }),
    eeHeaderLayout,
    eeOverviewLayout,
    EntityDetailTabBlueprint.make({
      name: 'image',
      params: {
        manifest: automationContentManifest,
        capabilityId: eeCapabilityId,
        entryPointId: eeDetailsEntryId,
        attachment: 'entity.detail.tabs',
        loader: async ({ entity }) => {
          const { EEImageDetails } = await import(
            './components/ExecutionEnvironments/EEImageDetails'
          );
          return <EEImageDetails entity={entity} />;
        },
      },
    }),
  ],
});

export default automationContentPlugin;
