import {
  createServiceFactory,
  createServiceRef,
} from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import type { JsonObject } from '@backstage/types';

/** Read-only status contribution. Provider objects and write APIs stay with owners. */
export interface CatalogStatusSource {
  isReady(): boolean;
  getStatus(): JsonObject;
}

export interface CatalogStatusSourcesService {
  register(registration: { id: string; source: CatalogStatusSource }): void;
  get(id: string): CatalogStatusSource;
}

export class PortalCatalogStatusSources implements CatalogStatusSourcesService {
  private readonly sources = new Map<string, CatalogStatusSource>();

  register({ id, source }: { id: string; source: CatalogStatusSource }): void {
    if (
      typeof id !== 'string' ||
      !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id)
    ) {
      throw new InputError(
        'A contributor-namespaced status source ID is required',
      );
    }
    if (this.sources.has(id))
      throw new ConflictError(`Duplicate catalog status source: ${id}`);
    if (
      !source ||
      typeof source.isReady !== 'function' ||
      typeof source.getStatus !== 'function'
    )
      throw new InputError('Invalid catalog status source');
    const isReady = source.isReady.bind(source);
    const getStatus = source.getStatus.bind(source);
    this.sources.set(id, {
      isReady,
      getStatus() {
        if (isReady() !== true)
          throw new Error(`Catalog status source is not ready: ${id}`);
        return getStatus();
      },
    });
  }

  get(id: string): CatalogStatusSource {
    const source = this.sources.get(id);
    if (!source)
      throw new NotFoundError(`Catalog status source is not registered: ${id}`);
    return source;
  }
}

export const portalCatalogStatusSourcesServiceRef =
  createServiceRef<CatalogStatusSourcesService>({
    id: 'portal.catalog-status-sources',
    scope: 'root',
    defaultFactory: service =>
      Promise.resolve(
        createServiceFactory({
          service,
          deps: {},
          factory: () => new PortalCatalogStatusSources(),
        }),
      ),
  });
