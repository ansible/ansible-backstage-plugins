import { contributionRegistry } from '@ansible/portal-extension-api';
import { createApp } from '@backstage/frontend-defaults';
import { portalNfsFeatures } from './AppNfs';

jest.mock('@backstage/frontend-defaults', () => ({
  createApp: jest.fn(() => ({ createRoot: () => <div>NFS root</div> })),
}));
jest.mock('./baseApis', () => ({ baseApis: [] }));
jest.mock('./identityProviders', () => ({ providers: [] }));
jest.mock('@red-hat-developer-hub/backstage-plugin-theme', () => ({
  getThemes: () => [],
}));

describe('NFS app', () => {
  it('registers native administration, settings, search and the authenticated shell', () => {
    for (const pluginId of ['rbac', 'user-settings', 'search']) {
      expect(
        portalNfsFeatures.some(
          feature => 'pluginId' in feature && feature.pluginId === pluginId,
        ),
      ).toBe(true);
    }
    expect(
      portalNfsFeatures.some(
        feature =>
          'extensions' in feature &&
          (feature.extensions as Array<{ id: string }>).some(
            extension => extension.id === 'app-root-wrapper:app/portal-shell',
          ),
      ),
    ).toBe(true);
  });
  it('composes the actual host and APME alpha features without legacy registration', () => {
    expect(createApp).toHaveBeenCalledWith({ features: portalNfsFeatures });
    expect(
      portalNfsFeatures.some(
        feature => 'pluginId' in feature && feature.pluginId === 'portal',
      ),
    ).toBe(true);
    expect(
      portalNfsFeatures.some(
        feature => 'pluginId' in feature && feature.pluginId === 'apme',
      ),
    ).toBe(true);
    expect(contributionRegistry.getScaffolderFields()).toEqual([]);
    expect(
      portalNfsFeatures.some(
        feature =>
          'pluginId' in feature && feature.pluginId === 'portal-scaffolder',
      ),
    ).toBe(true);
    expect(contributionRegistry.getManifests()).toEqual([]);
    expect(
      portalNfsFeatures.some(
        feature =>
          'pluginId' in feature && feature.pluginId === 'catalog-import',
      ),
    ).toBe(true);
  });
});
