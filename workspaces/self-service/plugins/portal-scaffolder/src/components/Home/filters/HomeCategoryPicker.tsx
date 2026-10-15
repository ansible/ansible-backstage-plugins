import { useEffect, useRef, useState } from 'react';
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
  const { updateFilters } = useEntityList();
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [userSelection, setUserSelection] = useState<string[]>([]);
  const userSelectionRef = useRef(userSelection);
  userSelectionRef.current = userSelection;
  /**
   * Types last passed to `updateFilters` for the default (no user selection)
   * case. The real EntityListProvider resets the page offset on every
   * `updateFilters` call, which would defeat the soft refresh's
   * page-preserving intent if we reapplied an unchanged filter on every
   * facet refresh (e.g. after a sync that didn't change categories).
   */
  const appliedTypesRef = useRef<string[] | null>(null);

  useEffect(() => {
    let active = true;
    catalogApi
      .getEntityFacets({
        filter: { kind: 'Template' },
        facets: ['spec.type'],
      })
      .then(response => {
        if (!active) {
          return;
        }
        const nonEE = (response.facets['spec.type'] ?? [])
          .map(f => f.value)
          .filter(t => !isExecutionEnvironmentType(t))
          .sort((a, b) => a.localeCompare(b));
        setAllCategories(nonEE);
        if (userSelectionRef.current.length === 0) {
          const unchanged =
            appliedTypesRef.current !== null &&
            appliedTypesRef.current.length === nonEE.length &&
            appliedTypesRef.current.every((t, i) => t === nonEE[i]);
          if (!unchanged) {
            appliedTypesRef.current = nonEE;
            updateFilters({
              type:
                nonEE.length > 0 ? new EntityTypeFilter(nonEE) : undefined,
            });
          }
        }
      })
      .catch(() => {
        if (active) {
          setAllCategories([]);
        }
      });
    return () => {
      active = false;
    };
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
