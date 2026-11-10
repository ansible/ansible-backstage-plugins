import { createFrontendFeatureLoader } from '@backstage/frontend-plugin-api';

/** Native hosts with user-settings receive the AAP row without extra configuration. */
export default createFrontendFeatureLoader({
  async loader() {
    const { createAapSettingsModule } = await import('./settings');
    return [createAapSettingsModule()];
  },
});
