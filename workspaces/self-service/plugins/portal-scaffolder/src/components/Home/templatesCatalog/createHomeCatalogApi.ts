import {
  CatalogApi,
  QueryEntitiesInitialRequest,
  QueryEntitiesRequest,
} from '@backstage/catalog-client';
import type { FilterPredicate } from '@backstage/filter-predicates';
import { buildHomeTemplateCatalogQuery } from './buildHomeTemplateQuery';
import { normalizeQueryOffset } from './offsetRefresh';

/**
 * Catalog client that scopes Home templates to the logged-in user's JT set
 * (and optional source filters). Also normalizes soft-refresh sentinel offsets.
 */
export function createHomeCatalogApi(
  catalogApi: CatalogApi,
  jobTemplateIds: number[],
  selectedSources: string[],
): CatalogApi {
  const withVisibilityQuery = (
    request: QueryEntitiesInitialRequest = {},
  ): QueryEntitiesInitialRequest => {
    const { filter, offset, ...rest } = request;
    const next: QueryEntitiesInitialRequest = {
      ...rest,
      query: buildHomeTemplateCatalogQuery({
        jobTemplateIds,
        catalogFilter: filter ?? {},
        selectedSources,
      }) as FilterPredicate,
    };

    if (typeof offset === 'number') {
      next.offset = normalizeQueryOffset(offset);
    }

    return next;
  };

  return new Proxy(catalogApi, {
    get(target, prop, receiver) {
      if (prop === 'queryEntities') {
        return (request?: QueryEntitiesRequest) => {
          if (request && 'cursor' in request && request.cursor) {
            return target.queryEntities(request);
          }
          return target.queryEntities(
            withVisibilityQuery(request as QueryEntitiesInitialRequest),
          );
        };
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
