import {
  CatalogApi,
  QueryEntitiesInitialRequest,
  QueryEntitiesRequest,
} from '@backstage/catalog-client';
import type { FilterPredicate } from '@backstage/filter-predicates';
import { buildHomeTemplateCatalogQuery } from './buildHomeTemplateQuery';

export function createHomeCatalogApi(
  catalogApi: CatalogApi,
  jobTemplateIds: number[],
  selectedSources: string[],
): CatalogApi {
  const withVisibilityQuery = (
    request: QueryEntitiesInitialRequest = {},
  ): QueryEntitiesInitialRequest => {
    const catalogFilter = request.filter ?? {};
    const query = buildHomeTemplateCatalogQuery({
      jobTemplateIds,
      catalogFilter,
      selectedSources,
    });

    const { filter: _filter, ...rest } = request;
    return {
      ...rest,
      query: query as FilterPredicate,
    };
  };

  return new Proxy(catalogApi, {
    get(target, prop, receiver) {
      if (prop === 'queryEntities') {
        return async (request?: QueryEntitiesRequest) => {
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
