import { EntityFilterQuery } from '@backstage/catalog-client';
import type { FilterPredicate } from '@backstage/filter-predicates';
import { TEMPLATE_SOURCE_ANNOTATION } from '../utils/SourcePicker';
import { buildVisibilityPredicate } from './buildVisibilityPredicate';

const SOURCE_FACET_KEY = `metadata.annotations.${TEMPLATE_SOURCE_ANNOTATION}`;

function entityFilterQueryToPredicates(
  filter: EntityFilterQuery,
): FilterPredicate[] {
  const entries = Array.isArray(filter)
    ? filter.flatMap(item => Object.entries(item))
    : Object.entries(filter);

  return entries
    .filter(([, value]) => typeof value === 'string' || Array.isArray(value))
    .map(([key, value]) => {
      const values = (Array.isArray(value) ? value : [value]).map(String);
      return values.length === 1
        ? ({ [key]: values[0] } as FilterPredicate)
        : ({ [key]: { $in: values } } as FilterPredicate);
    });
}

export function buildHomeTemplateCatalogQuery(options: {
  jobTemplateIds: number[];
  catalogFilter?: EntityFilterQuery;
  selectedSources?: string[];
}): FilterPredicate {
  const predicates: FilterPredicate[] = [
    buildVisibilityPredicate(options.jobTemplateIds),
    ...entityFilterQueryToPredicates(options.catalogFilter ?? {}),
  ];

  if (options.selectedSources && options.selectedSources.length > 0) {
    predicates.push({
      [SOURCE_FACET_KEY]: { $in: options.selectedSources },
    } as FilterPredicate);
  }

  return { $all: predicates };
}
