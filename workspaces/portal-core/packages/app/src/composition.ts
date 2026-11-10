import {
  createFrontendFeatureLoader,
  type ConfigApi,
} from '@backstage/frontend-plugin-api';

export type PortalDevelopmentProfile = 'full' | 'scaffolder' | 'core';

/** Development harness selection, not a host contract or an authorization gate. */
export function resolveDevelopmentProfile(
  config: ConfigApi,
): PortalDevelopmentProfile {
  const profile =
    config.getOptionalString('portal.development.profile') ?? 'full';
  if (profile !== 'full' && profile !== 'scaffolder' && profile !== 'core') {
    throw new Error(
      `Unknown portal.development.profile '${profile}'; use full, scaffolder or core`,
    );
  }
  return profile;
}

// Imports are only evaluated for selected contributors. Generic host plugins
// remain unaware of this development harness's optional package inventory.
export const optionalContributorLoader = createFrontendFeatureLoader({
  loader({ config }) {
    const profile = resolveDevelopmentProfile(config);
    const portalScaffolderFeatures =
      profile !== 'core'
        ? createFrontendFeatureLoader({
            loader: async () => {
              const module = await import('@ansible/portal-scaffolder/alpha');
              return [module.default, module.portalScaffolderFormFieldsModule];
            },
          })
        : undefined;
    return [
      ...(portalScaffolderFeatures ? [portalScaffolderFeatures] : []),
      ...(profile === 'full'
        ? [
            import('@ansible/plugin-backstage-apme/alpha'),
            import('@ansible/plugin-backstage-rhaap/alpha'),
          ]
        : []),
    ];
  },
});
