import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  EntityTagFilter,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import { TagFilterPicker } from '../../utils/TagFilterPicker';
import { isExecutionEnvironmentType } from '../constants';

type HomeTagPickerProps = {
  syncKey: number;
};

/** Facet-driven tag filter for Home templates (excludes EE template types). */
export const HomeTagPicker = ({ syncKey }: HomeTagPickerProps) => {
  const catalogApi = useApi(catalogApiRef);
  const { filters, updateFilters } = useEntityList();
  const selectedTags = (filters.tags as EntityTagFilter)?.values ?? [];
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    catalogApi
      .getEntityFacets({
        filter: { kind: 'Template' },
        facets: ['spec.type'],
      })
      .then(response => {
        const nonEETypes = (response.facets['spec.type'] ?? [])
          .map(f => f.value)
          .filter(t => !isExecutionEnvironmentType(t));
        return catalogApi.getEntityFacets({
          filter: {
            kind: 'Template',
            ...(nonEETypes.length > 0 && { 'spec.type': nonEETypes }),
          },
          facets: ['metadata.tags'],
        });
      })
      .then(response => {
        const tags = (response.facets['metadata.tags'] ?? [])
          .map(f => f.value)
          .sort((a, b) => a.localeCompare(b));
        setAvailableTags(tags);
      })
      .catch(() => {
        setAvailableTags([]);
      });
  }, [catalogApi, syncKey]);

  const handleTagChange = (newValue: string[]) => {
    updateFilters({
      tags: newValue.length > 0 ? new EntityTagFilter(newValue) : undefined,
    });
  };

  return (
    <TagFilterPicker
      label="Tags"
      options={availableTags}
      value={selectedTags}
      onChange={handleTagChange}
      noOptionsText="No tags available"
    />
  );
};
