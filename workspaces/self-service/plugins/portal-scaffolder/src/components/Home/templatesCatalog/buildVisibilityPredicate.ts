import type { FilterPredicate } from '@backstage/filter-predicates';

export function buildVisibilityPredicate(
  jobTemplateIds: number[],
): FilterPredicate {
  const branches: FilterPredicate[] = [
    { 'metadata.aapJobTemplateId': { $exists: false } },
  ];
  if (jobTemplateIds.length > 0) {
    branches.push({
      'metadata.aapJobTemplateId': {
        $in: jobTemplateIds.map(String),
      },
    });
  }
  return { $any: branches };
}
