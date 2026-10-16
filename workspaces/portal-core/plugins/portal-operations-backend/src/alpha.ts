import {
  coreServices,
  createBackendFeatureLoader,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import {
  PortalOperations,
  PortalEntitlements,
  PortalHealth,
  portalOperationsServiceRef,
  portalEntitlementsServiceRef,
  portalHealthServiceRef,
  portalActiveOrganizationServiceRef,
} from '@ansible/portal-plugin-node';
import plugin from './index';

/** Register host-owned root services once across independently embedded SDKs. */
export default createBackendFeatureLoader({
  loader: async function* () {
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
    yield plugin;
  },
});
