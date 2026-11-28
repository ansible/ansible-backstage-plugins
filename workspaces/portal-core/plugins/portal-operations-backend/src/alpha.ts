import {
  coreServices,
  createBackendFeatureLoader,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import {
  PortalOperations,
  PortalEntitlements,
  PortalHealth,
  PortalCatalogEntityProviders,
  PortalCatalogStatusSources,
  portalCatalogStatusSourcesServiceRef,
  portalCatalogEntityProvidersServiceRef,
  portalOperationsServiceRef,
  portalEntitlementsServiceRef,
  portalHealthServiceRef,
  portalActiveOrganizationServiceRef,
} from '@ansible/portal-plugin-node';
import plugin from './index';

/** Register host-owned root services once across independently embedded SDKs. */
export default createBackendFeatureLoader({
  loader: function* () {
    yield createServiceFactory({
      service: portalOperationsServiceRef,
      deps: {
        logger: coreServices.rootLogger,
        organizations: portalActiveOrganizationServiceRef,
        entitlements: portalEntitlementsServiceRef,
      },
      factory: ({ logger, organizations, entitlements }) =>
        new PortalOperations(logger, organizations, entitlements),
    });
    yield createServiceFactory({
      service: portalEntitlementsServiceRef,
      deps: {
        config: coreServices.rootConfig,
        organizations: portalActiveOrganizationServiceRef,
      },
      factory: ({ config, organizations }) =>
        new PortalEntitlements(config, organizations),
    });
    yield createServiceFactory({
      service: portalHealthServiceRef,
      deps: {},
      factory: () => new PortalHealth(),
    });
    yield createServiceFactory({
      service: portalCatalogEntityProvidersServiceRef,
      deps: {},
      factory: () => new PortalCatalogEntityProviders(),
    });
    yield createServiceFactory({
      service: portalCatalogStatusSourcesServiceRef,
      deps: {},
      factory: () => new PortalCatalogStatusSources(),
    });
    yield plugin;
  },
});
