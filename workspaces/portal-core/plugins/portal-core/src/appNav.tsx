import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { PortalNavigation } from './PortalNavigation';

/** App-owned navigation seam; opt-in and independent of contributor semantics. */
export default createFrontendModule({
  pluginId: 'app',
  extensions: [
    NavContentBlueprint.make({
      name: 'portal',
      disabled: true,
      params: { component: PortalNavigation },
    }),
  ],
});
