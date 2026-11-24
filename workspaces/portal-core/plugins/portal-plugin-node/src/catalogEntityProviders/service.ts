import {
  createServiceFactory,
  createServiceRef,
} from '@backstage/backend-plugin-api';
import { PortalCatalogEntityProviders } from './registry';
import type { CatalogEntityProvidersService } from './types';

/** Shared through backend DI, including independently embedded SDK copies. */
export const portalCatalogEntityProvidersServiceRef =
  createServiceRef<CatalogEntityProvidersService>({
    id: 'portal.catalog-entity-providers',
    scope: 'root',
    defaultFactory: service =>
      Promise.resolve(
        createServiceFactory({
          service,
          deps: {},
          factory: () => new PortalCatalogEntityProviders(),
        }),
      ),
  });
