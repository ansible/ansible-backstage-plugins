import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import { fullEntityRef, invokeCatalogEntityProvider } from './mutation';
import type {
  CatalogEntityProvider,
  CatalogEntityProviderRegistration,
  CatalogEntityProvidersService,
} from './types';

const PROVIDER_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

/** Generic discovery only: contributors supply all domain implementations. */
export class PortalCatalogEntityProviders
  implements CatalogEntityProvidersService
{
  private readonly providers = new Map<string, CatalogEntityProvider>();

  register({ id, provider }: CatalogEntityProviderRegistration): void {
    if (typeof id !== 'string' || !PROVIDER_ID.test(id)) {
      throw new InputError('A contributor-namespaced provider ID is required');
    }
    if (this.providers.has(id)) {
      throw new ConflictError(`Duplicate catalog entity provider: ${id}`);
    }
    if (
      !provider ||
      typeof provider.isReady !== 'function' ||
      typeof provider.withEntityMutation !== 'function'
    ) {
      throw new InputError('Invalid catalog entity provider');
    }
    const isReady = provider.isReady.bind(provider);
    const withEntityMutation = provider.withEntityMutation.bind(provider);
    const assertReady = () => {
      if (isReady() !== true) {
        throw new Error(`Catalog entity provider is not ready: ${id}`);
      }
    };
    this.providers.set(id, {
      isReady,
      async withEntityMutation(options, operation) {
        assertReady();
        const entityRef = fullEntityRef(options.entityRef);
        return invokeCatalogEntityProvider(
          withEntityMutation,
          entityRef,
          assertReady,
          operation,
        );
      },
    });
  }

  get(providerId: string): CatalogEntityProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new NotFoundError(
        `Catalog entity provider is not registered: ${providerId}`,
      );
    }
    return provider;
  }
}
