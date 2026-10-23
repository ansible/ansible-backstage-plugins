import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import {
  GlobalHeaderComponentBlueprint,
  GlobalHeaderMenuItemBlueprint,
} from '@red-hat-developer-hub/backstage-plugin-global-header';

/** Install only in RHDH; neither generic SDK contracts nor contributors import this plugin. */
export default createFrontendPlugin({
  pluginId: 'portal-rhdh',
  extensions: [
    GlobalHeaderComponentBlueprint.make({
      name: 'create',
      params: {
        priority: 90,
        loader: () =>
          import('./RhdhCreateAction').then(m => m.RhdhCreateAction),
      },
    }),
    GlobalHeaderMenuItemBlueprint.make({
      name: 'profile',
      params: {
        target: 'profile',
        priority: 10,
        loader: () =>
          import('./RhdhProfileMenuItems').then(m => m.RhdhProfileMenuItems),
      },
    }),
  ],
});
