import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { automationContentApiFactory } from './apis';
import { eeRouteRef } from './routes';

export const automationContentPlugin = createPlugin({
  id: 'automation-content',
  apis: [automationContentApiFactory],
});

/**
 * The only legacy routable extension, and the only mount that binds the EE
 * route refs its pages consume.
 *
 * There is deliberately no root-level "AutomationContentPage" extension: a
 * host mounting only a plugin root leaves `eeRouteRef`/`eeDetailsRouteRef`
 * unbound, and the pages inside crash on `useRouteRef` instead of rendering.
 * Hosts mount this page (as the local app and the janus example do) or use
 * the native entry point, whose `ee` PageBlueprint declares the same ref at
 * `/content/ee`.
 */
export const AutomationContentEEPage = automationContentPlugin.provide(
  createRoutableExtension({
    name: 'AutomationContentEEPage',
    component: () =>
      import('./components/ExecutionEnvironments/EERoutesPage').then(
        m => m.EERoutesPage,
      ),
    mountPoint: eeRouteRef,
  }),
);
