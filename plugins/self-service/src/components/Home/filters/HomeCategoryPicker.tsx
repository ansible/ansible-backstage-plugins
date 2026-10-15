import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  EntityTypeFilter,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import { TagFilterPicker } from '../../utils/TagFilterPicker';
import { isExecutionEnvironmentType } from '../constants';

type HomeCategoryPickerProps = {
  syncKey: number;
};

/** Facet-driven category (`spec.type`) filter for Home templates. */
export const HomeCategoryPicker = ({ syncKey }: HomeCategoryPickerProps) => {
  const catalogApi = useApi(catalogApiRef);
  const { filters, updateFilters } = useEntityList();
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [userSelection, setUserSelection] = useState<string[]>([]);

  useEffect(() => {
    catalogApi
      .getEntityFacets({
        filter: { kind: 'Template' },
        facets: ['spec.type'],
      })
      .then(response => {
        const nonEE = (response.facets['spec.type'] ?? [])
          .map(f => f.value)
          .filter(t => !isExecutionEnvironmentType(t))
          .sort((a, b) => a.localeCompare(b));
        setAllCategories(nonEE);
        if (!filters.type || filters.type.getTypes().length === 0) {
          updateFilters({
            type: nonEE.length > 0 ? new EntityTypeFilter(nonEE) : undefined,
          });
        }
      })
      .catch(() => {
        setAllCategories([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh facets on syncKey only
  }, [catalogApi, syncKey]);

  const handleCategoryChange = (newValue: string[]) => {
    setUserSelection(newValue);
    const typesToFilter = newValue.length > 0 ? newValue : allCategories;
    updateFilters({
      type:
        typesToFilter.length > 0
          ? new EntityTypeFilter(typesToFilter)
          : undefined,
    });
  };

  return (
    <TagFilterPicker
      label="Categories"
      options={allCategories}
      value={userSelection}
      onChange={handleCategoryChange}
      noOptionsText="No categories available"
    />
  );
};
