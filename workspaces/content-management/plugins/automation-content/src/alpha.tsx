import {
  ApiBlueprint,
  createFrontendPlugin,
  createRouteRef,
  PageBlueprint,
  type ExtensionDefinition,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { EntityContentLayoutBlueprint } from '@backstage/plugin-catalog-react/alpha';
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
import { eeMessages } from './strings/en';

const eeRouteRef = createRouteRef();

export const eeOverviewLayout: ExtensionDefinition =
  EntityContentLayoutBlueprint.make({
    name: 'ee-repository',
    params: {
      filter: entity =>
        entity.kind.toLowerCase() === 'component' &&
        entity.spec?.type === EE_REPOSITORY_ENTITY_TYPE &&
        entity.metadata.annotations?.[EE_REPOSITORY_ANNOTATIONS.marker] ===
          'true',
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
        title: eeMessages.pageTitle,
        icon: <RiBox3Line />,
        loader: async () => {
          const { EEImagesPage } = await import(
            './components/ExecutionEnvironments/EEImagesPage'
          );
          return <EEImagesPage />;
        },
      },
    }),
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
